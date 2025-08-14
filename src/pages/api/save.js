import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/save
 * Body:
 *  - { changes: [{ roleId, permissionId, allow }], clientVersion?: number }
 *  - oder { items: [{ roleId, permissionId }], clientVersion?: number }
 *
 * Verhalten:
 *  - Verhindert Save, wenn lockedAt gesetzt (423).
 *  - Prüft assignVersion; bei Mismatch -> 409 Conflict + liefert serverVersion + draftSavedAt.
 *  - Bei Erfolg: draftSavedAt = now, assignVersion = assignVersion + 1
 */
export default withApiSession(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const customerId = req.session.customerId;
  if (!customerId) return res.status(401).json({ error: "Nicht eingeloggt." });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { id: true, lockedAt: true, assignVersion: true }
  });
  if (!customer) return res.status(404).json({ error: "Kunde nicht gefunden." });
  if (customer.lockedAt) return res.status(423).json({ error: "Datensatz ist gesperrt. Änderungen sind nicht möglich." });

  const { changes, items, clientVersion } = req.body || {};
  const serverVersion = customer.assignVersion ?? 0;

  if (typeof clientVersion === "number" && clientVersion !== serverVersion) {
    return res.status(409).json({
      error: "Konflikt: Zwischenzeitlich wurde gespeichert.",
      serverVersion
    });
  }

  let savedCount = 0;

  if (Array.isArray(items)) {
    for (const it of items) {
      if (!it?.roleId || !it?.permissionId) {
        return res.status(400).json({ error: "items enthält ungültige Einträge." });
      }
    }
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { customerId } }),
      prisma.rolePermission.createMany({
        data: items.map(it => ({ customerId, roleId: it.roleId, permissionId: it.permissionId })),
        skipDuplicates: true
      })
    ]);
    savedCount = items.length;
  } else {
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ error: "Keine Änderungen übermittelt." });
    }
    for (const ch of changes) {
      if (!ch?.roleId || !ch?.permissionId || typeof ch.allow !== "boolean") {
        return res.status(400).json({ error: "changes enthält ungültige Einträge." });
      }
    }
    const ops = [];
    for (const ch of changes) {
      if (ch.allow) {
        ops.push(prisma.rolePermission.upsert({
          where: { customerId_roleId_permissionId: { customerId, roleId: ch.roleId, permissionId: ch.permissionId } },
          update: {},
          create: { customerId, roleId: ch.roleId, permissionId: ch.permissionId }
        }));
      } else {
        ops.push(prisma.rolePermission.deleteMany({ where: { customerId, roleId: ch.roleId, permissionId: ch.permissionId } }));
      }
    }
    await prisma.$transaction(ops);
    savedCount = changes.length;
  }

  const updated = await prisma.customer.update({
    where: { id: customerId },
    data: { draftSavedAt: new Date(), assignVersion: { increment: 1 } },
    select: { draftSavedAt: true, assignVersion: true }
  });

  return res.json({
    ok: true,
    saved: savedCount,
    draftSavedAt: updated.draftSavedAt?.toISOString() || null,
    assignVersion: updated.assignVersion
  });
});
