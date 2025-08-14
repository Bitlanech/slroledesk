import { withApiSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default withApiSession(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Code fehlt." });

  const access = await prisma.accessCode.findUnique({ where: { code } });
  if (!access || !access.active) return res.status(401).json({ error: "Ungültiger oder inaktiver Code." });

  const customer = await prisma.customer.findUnique({ where: { id: access.customerId } });
  if (!customer) return res.status(401).json({ error: "Kunde nicht gefunden." });

  req.session.customerId = customer.id;
  req.session.customerCode = code;
  await req.session.save();

  res.json({ ok: true });
});
