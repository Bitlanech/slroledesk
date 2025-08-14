import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET:   Liste Rollen des eingeloggten Kunden
// POST:  { name } → Rolle anlegen
// PATCH: { id, name } → Rolle umbenennen
// DELETE:{ id } → Rolle löschen (+ zugehörige RolePermission)

export default withApiSession(async function handler(req, res) {
  const customerId = req.session.customerId;
  if (!customerId) return res.status(401).json({ error: "Nicht eingeloggt." });

  if (req.method === "GET") {
    const roles = await prisma.role.findMany({
      where: { customerId },
      orderBy: { name: "asc" }
    });
    return res.json({ roles });
  }

  if (req.method === "POST") {
    const { name } = req.body || {};
    const trimmed = String(name || "").trim();
    if (!trimmed) return res.status(400).json({ error: "Name fehlt." });

    try {
      const role = await prisma.role.create({
        data: { name: trimmed, customerId }
      });
      return res.json({ role });
    } catch (e) {
      return res.status(400).json({ error: "Rolle konnte nicht angelegt werden (Name ggf. bereits vergeben)." });
    }
  }

  if (req.method === "PATCH") {
    const { id, name } = req.body || {};
    const trimmed = String(name || "").trim();
    if (!id || !trimmed) return res.status(400).json({ error: "id/name fehlen." });

    try {
      const role = await prisma.role.update({
        where: { id },
        data: { name: trimmed }
      });
      return res.json({ role });
    } catch (e) {
      return res.status(400).json({ error: "Rolle konnte nicht umbenannt werden (Name ggf. bereits vergeben)." });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ error: "id fehlt." });

    // cleanup RolePermissions dieser Rolle
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { customerId, roleId: id } }),
      prisma.role.delete({ where: { id } })
    ]);
    return res.json({ ok: true });
  }

  return res.status(405).end();
});
