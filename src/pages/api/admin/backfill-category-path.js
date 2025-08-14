import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default withApiSession(async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const okToken = req.headers["x-admin-token"] === process.env.ADMIN_TOKEN;
  const isAdmin = !!req.session?.admin;
  if (!okToken && !isAdmin) return res.status(401).json({ error: "Nicht autorisiert." });

  const all = await prisma.permission.findMany({ select: { id:true, category:true, categoryPath:true } });
  let updated = 0;
  for (const p of all) {
    if (Array.isArray(p.categoryPath) && p.categoryPath.length) continue;
    // Best Effort: wenn nur eine CSV-Zeile ohne Subgruppen war, lassen wir ALLES als 1 Teil.
    // Wenn klare Hierarchie gemeint war, trennen wir an " / ".
    const parts = (p.category || "").includes(" / ")
      ? p.category.split(" / ").map(s=>s.trim()).filter(Boolean)
      : [p.category || "Allgemein"];
    await prisma.permission.update({ where: { id: p.id }, data: { categoryPath: parts } });
    updated++;
  }
  return res.json({ ok: true, updated, total: all.length });
});
