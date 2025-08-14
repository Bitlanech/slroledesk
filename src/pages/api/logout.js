import { withApiSession } from "../../lib/auth";

export default withApiSession(async function handler(req, res) {
  req.session.destroy();
  res.json({ ok: true });
});
