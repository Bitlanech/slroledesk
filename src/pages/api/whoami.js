import { withApiSession } from "@/lib/auth";

export default withApiSession(async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const isAdmin = !!req.session?.admin;
  const isCustomer = !!req.session?.customerId;

  return res.json({
    isAdmin,
    isCustomer,
    customerId: req.session?.customerId || null
  });
});
