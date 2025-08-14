import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/submit
 * Body: { items: [{ roleId, permissionId }], clientVersion?: number }
 * - Schreibt vollständigen Satz und setzt lockedAt (final).
 * - Prüft assignVersion wie /api/save; bei Mismatch -> 409.
 * - Erhöht assignVersion nochmals (finale Version).
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
  if (customer.lockedAt) return res.status(423).json({ error: "Bereits gesperrt." });

  const { items, clientVersion } = req.body || {};
  const serverVersion = customer.assignVersion ?? 0;

  if (typeof clientVersion === "number" && clientVersion !== serverVersion) {
    return res.status(409).json({
      error: "Konflikt: Zwischenzeitlich wurde gespeichert.",
      serverVersion
    });
  }

  if (!Array.isArray(items)) return res.status(400).json({ error: "items fehlt." });
  for (const it of items) {
    if (!it?.roleId || !it?.permissionId) return res.status(400).json({ error: "items enthält ungültige Einträge." });
  }

  await prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { customerId } }),
    prisma.rolePermission.createMany({
      data: items.map(it => ({ customerId, roleId: it.roleId, permissionId: it.permissionId })),
      skipDuplicates: true
    }),
    prisma.customer.update({
      where: { id: customerId },
      data: {
        lockedAt: new Date(),
        draftSavedAt: new Date(),
        assignVersion: { increment: 1 }
      }
    })
  ]);

  const updated = await prisma.customer.findUnique({
    where: { id: customerId },
    select: { lockedAt: true, assignVersion: true }
  });

  return res.json({
    ok: true,
    lockedAt: updated?.lockedAt?.toISOString() || null,
    assignVersion: updated?.assignVersion ?? null
  });
});
