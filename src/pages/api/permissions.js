import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseCsv, normalizeToken } from "@/lib/csv";

export const config = { api: { bodyParser: false } };
const MAX_BYTES = 5 * 1024 * 1024;

function actionOf(key) {
  const parts = String(key || "").split(".");
  return parts[parts.length - 1] || "";
}
function baseKeyOf(key) {
  const parts = String(key || "").split(".");
  parts.pop();
  return parts.join(".");
}

async function readBuffer(req) {
  const Busboy = (await import("busboy")).default;
  const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_BYTES, files: 1, fields: 10 } });
  const fields = {};
  let fileBuffer;
  let fileTooLarge = false;

  await new Promise((resolve, reject) => {
    req.pipe(bb);
    bb.on("file", (_name, file) => {
      const chunks = [];
      let size = 0;
      file.on("data", (d) => {
        size += d.length;
        if (size > MAX_BYTES) { fileTooLarge = true; file.truncate(); return; }
        chunks.push(d);
      });
      file.on("limit", () => { fileTooLarge = true; });
      file.on("end", () => { if (!fileTooLarge) fileBuffer = Buffer.concat(chunks); });
    });
    bb.on("field", (name, val) => (fields[name] = val));
    bb.on("finish", resolve);
    bb.on("error", reject);
  });

  if (fileTooLarge) throw new Error("Datei zu groß (Limit 5 MB).");
  return { fields, file: fileBuffer };
}

export default withApiSession(async function handler(req, res) {
  if (req.method === "GET") {
    const customerId = req.session.customerId;
    if (!customerId) return res.status(401).json({ error: "Nicht eingeloggt." });

    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { lockedAt: true, draftSavedAt: true, assignVersion: true }
    });
    if (!customer) return res.status(404).json({ error: "Kunde nicht gefunden." });

    const roles = await prisma.role.findMany({ where: { customerId }, orderBy: { name: "asc" }});
    const permissions = await prisma.permission.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
      select: { id: true, key: true, category: true, categoryPath: true, description: true }
    });
    const assigned = await prisma.rolePermission.findMany({ where: { customerId }});

    const mapAssigned = new Set(assigned.map(a => `${a.roleId}:${a.permissionId}`));
    return res.json({
      lockedAt: customer.lockedAt,
      draftSavedAt: customer.draftSavedAt,
      assignVersion: customer.assignVersion,
      roles,
      permissions,
      assigned: Array.from(mapAssigned)
    });
  }

  if (req.method === "POST") {
    const { fields, file } = await readBuffer(req).catch((e) => ({
      fields: { __error: e instanceof Error ? e.message : String(e) }, file: null
    }));
    if (fields?.__error) return res.status(400).json({ error: fields.__error });

    const hasAdminSession = !!req.session?.admin;
    const hasValidToken = fields?.adminToken && fields.adminToken === process.env.ADMIN_TOKEN;
    if (!hasAdminSession && !hasValidToken) {
      return res.status(401).json({ error: "Nicht autorisiert." });
    }
    if (!file) return res.status(400).json({ error: "CSV-Datei fehlt oder war leer." });

    let parsed;
    try { parsed = parseCsv(file); }
    catch (e) { return res.status(400).json({ error: `CSV-Parsing fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}` }); }

    // 1) Vorhandene Permissions indexieren
    const existing = await prisma.permission.findMany({ select: { id: true, key: true, category: true } });
    const byKey = new Map(existing.map(p => [p.key, p]));
    // baseKey -> (normalizedAction -> [permissions])
    const byBaseAction = new Map();
    for (const p of existing) {
      const base = baseKeyOf(p.key);
      const act = normalizeToken(actionOf(p.key));
      if (!byBaseAction.has(base)) byBaseAction.set(base, new Map());
      const inner = byBaseAction.get(base);
      if (!inner.has(act)) inner.set(act, []);
      inner.get(act).push(p);
    }

    // 2) Kanonische Upserts mit categoryPath
    const canonicalMap = new Map(); // key -> permission (neu/existierend)
    for (const row of parsed.rows) {
      const canonicalKey = row.key;
      const data = {
        category: row.category,
        description: row.description,
        categoryPath: row.categoryPath || null,
      };

      const exists = byKey.get(canonicalKey);
      if (exists) {
        const updated = await prisma.permission.update({
          where: { key: canonicalKey },
          data
        });
        byKey.set(canonicalKey, updated);
        canonicalMap.set(canonicalKey, updated);
        continue;
      }

      const base = baseKeyOf(canonicalKey);
      const actNorm = normalizeToken(actionOf(canonicalKey));
      const variants = (byBaseAction.get(base)?.get(actNorm)) || [];

      if (variants.length) {
        const legacy = variants[0];
        const migrated = await prisma.permission.update({
          where: { id: legacy.id },
          data: { key: canonicalKey, ...data }
        });
        byKey.delete(legacy.key);
        byKey.set(canonicalKey, migrated);

        const arr = byBaseAction.get(base).get(actNorm);
        const idxLegacy = arr.findIndex(p => p.id === legacy.id);
        if (idxLegacy > -1) arr[idxLegacy] = migrated;

        canonicalMap.set(canonicalKey, migrated);
      } else {
        const created = await prisma.permission.create({
          data: { key: canonicalKey, ...data }
        });
        byKey.set(canonicalKey, created);
        if (!byBaseAction.has(base)) byBaseAction.set(base, new Map());
        if (!byBaseAction.get(base).has(actNorm)) byBaseAction.get(base).set(actNorm, []);
        byBaseAction.get(base).get(actNorm).push(created);
        canonicalMap.set(canonicalKey, created);
      }
    }

    // 3) Dubletten konsolidieren
    for (const [base, actionMap] of byBaseAction.entries()) {
      for (const [act, list] of actionMap.entries()) {
        if (list.length <= 1) continue;
        const canonical = list.find(p => canonicalMap.has(p.key)) || list[0];
        for (const p of list) {
          if (p.id === canonical.id) continue;
          await prisma.rolePermission.updateMany({
            where: { permissionId: p.id },
            data: { permissionId: canonical.id }
          });
          await prisma.permission.delete({ where: { id: p.id } });
        }
      }
    }

    return res.json({ message: `Import ok. Permissions verarbeitet: ${parsed.rows.length}. Duplikate zusammengeführt.` });
  }

  return res.status(405).end();
});
