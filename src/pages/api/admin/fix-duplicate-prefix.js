import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default withApiSession(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const isAdmin = !!req.session?.admin;
  const okToken = req.headers["x-admin-token"] && req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
  if (!isAdmin && !okToken) return res.status(401).json({ error: "Nicht autorisiert." });

  const bad = await prisma.permission.findMany({
    where: { key: { startsWith: "funktion.funktion." } },
    select: { id: true, key: true }
  });

  let renamed = 0, merged = 0;

  for (const p of bad) {
    const correctedKey = p.key.replace(/^funktion\.funktion\./, "funktion.");
    const existing = await prisma.permission.findUnique({ where: { key: correctedKey }, select: { id: true, key: true } });

    if (existing) {
      // migriere rolePermission
      await prisma.rolePermission.updateMany({
        where: { permissionId: p.id },
        data: { permissionId: existing.id }
      });
      // lösche Dublette
      await prisma.permission.delete({ where: { id: p.id } });
      merged++;
    } else {
      await prisma.permission.update({
        where: { id: p.id },
        data: { key: correctedKey }
      });
      renamed++;
    }
  }

  return res.json({ ok: true, renamed, merged, checked: bad.length });
});
