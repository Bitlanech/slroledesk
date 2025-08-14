import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function requireAdmin(req, res) {
  if (!req.session.admin) {
    res.status(401).json({ error: "Nicht autorisiert." });
    return false;
  }
  return true;
}

function randomCode(len = 10) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export default withApiSession(async function handler(req, res) {
  if (!requireAdmin(req, res)) return;

  if (req.method === "GET") {
    const q = String(req.query.q || "").trim().toLowerCase();
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: "desc" },
      include: { accessCodes: true }
    });
    const filtered = q
      ? customers.filter(c =>
          [c.name, c.company, c.contactName, c.email, c.city, c.code]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q))
      : customers;
    return res.json({ customers: filtered });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const {
      id, name, code,
      company, contactName, email, phone, street, zip, city, country
    } = body;

    if (id) {
      const updated = await prisma.customer.update({
        where: { id },
        data: { name, company, contactName, email, phone, street, zip, city, country }
      });
      return res.json({ customer: updated });
    } else {
      if (!name) return res.status(400).json({ error: "name fehlt." });
      const newCustomer = await prisma.customer.create({
        data: {
          name,
          code: code && String(code).trim().length ? String(code).trim() : randomCode(8),
          company, contactName, email, phone, street, zip, city, country
        }
      });
      await prisma.accessCode.create({
        data: { code: newCustomer.code, customerId: newCustomer.id, active: true }
      });
      return res.json({ customer: newCustomer });
    }
  }

  if (req.method === "PATCH") {
    const { action } = req.body || {};
    if (!action) return res.status(400).json({ error: "action fehlt." });

    if (action === "lock" || action === "unlock") {
      const { customerId } = req.body;
      if (!customerId) return res.status(400).json({ error: "customerId fehlt." });
      const updated = await prisma.customer.update({
        where: { id: customerId },
        data: { lockedAt: action === "lock" ? new Date() : null }
      });
      return res.json({ customer: updated });
    }

    if (action === "code:new") {
      const { customerId, codeLength } = req.body || {};
      if (!customerId) return res.status(400).json({ error: "customerId fehlt." });
      const customer = await prisma.customer.findUnique({ where: { id: customerId }});
      if (!customer) return res.status(404).json({ error: "Kunde nicht gefunden." });
      const code = randomCode(codeLength || 10);
      const created = await prisma.accessCode.create({ data: { code, customerId, active: true }});
      return res.json({ code: created });
    }

    if (action === "code:setActive") {
      const { codeId, active } = req.body || {};
      if (!codeId || typeof active !== "boolean") return res.status(400).json({ error: "codeId/active fehlen." });
      const updated = await prisma.accessCode.update({ where: { id: codeId }, data: { active }});
      return res.json({ code: updated });
    }

    return res.status(400).json({ error: "Unbekannte action." });
  }

  if (req.method === "DELETE") {
    const { customerId } = req.body || {};
    if (!customerId) return res.status(400).json({ error: "customerId fehlt." });

    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { customerId } }),
      prisma.role.deleteMany({ where: { customerId } }),
      prisma.accessCode.deleteMany({ where: { customerId } }),
      prisma.customer.delete({ where: { id: customerId } })
    ]);

    return res.json({ ok: true });
  }

  return res.status(405).end();
});
