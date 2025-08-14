import { withApiSession } from "../../lib/auth";
import { prisma } from "../../lib/prisma";

export default withApiSession(async function handler(req, res) {
  const customerId = req.session.customerId;
  if (!customerId) return res.status(200).json({ authenticated: false });

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true, name: true, lockedAt: true,
      company: true, contactName: true, email: true, phone: true,
      street: true, zip: true, city: true, country: true
    }
  });

  res.json({ authenticated: true, customer });
});
