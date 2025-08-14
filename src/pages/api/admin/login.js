import { withApiSession } from "../../../lib/auth";

export default withApiSession(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { token } = req.body || {};
  if (!token || token !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: "Admin-Token ungültig." });
  }
  req.session.admin = true;
  await req.session.save();
  res.json({ ok: true });
});
