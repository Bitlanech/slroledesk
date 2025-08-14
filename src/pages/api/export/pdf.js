/* eslint-disable import/no-anonymous-default-export */
import { withApiSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import PDFDocument from "pdfkit";

const ACTION_LABEL = {
  access: "Erlaubt",
  read: "Lesen",
  edit: "Bearbeiten",
  create: "Anlegen",
  copy: "Kopieren",
  delete: "Entfernen",
  print: "Drucken",
};

function baseKeyOf(key) { const parts = String(key || "").split("."); parts.pop(); return parts.join("."); }
function actionOf(key) { const parts = String(key || "").split("."); return parts[parts.length - 1] || ""; }
function functionTitle(p) {
  if (p.description && p.description.includes(" – ")) return p.description.split(" – ")[0];
  const base = baseKeyOf(p.key); const segs = base.split("."); return segs[segs.length - 1] || p.key;
}
function categoryPathOf(p) {
  if (Array.isArray(p.categoryPath) && p.categoryPath.length) return p.categoryPath;
  return String(p.category || "Allgemein").split("/").map((s) => s.trim()).filter(Boolean);
}

function shapePermissions(permissions) {
  const byCatBase = new Map();
  for (const p of permissions) {
    const catParts = categoryPathOf(p);
    const catPath = catParts.join(" / ");
    if (!byCatBase.has(catPath)) byCatBase.set(catPath, new Map());
    const base = baseKeyOf(p.key);
    const act = actionOf(p.key);
    const map = byCatBase.get(catPath);
    if (!map.has(base)) map.set(base, { base, title: functionTitle(p), actions: {}, extras: {}, onlyAccess: false });
    const g = map.get(base);
    if (["access", "read", "edit", "create", "copy", "delete", "print"].includes(act)) g.actions[act] = p;
    else g.extras[act] = p;
  }
  for (const [, map] of byCatBase.entries()) {
    for (const [, g] of map.entries()) {
      const hasAccess = !!g.actions.access;
      const anyOtherStd = Object.keys(g.actions).some((k) => k !== "access");
      g.onlyAccess = hasAccess && !anyOtherStd && Object.keys(g.extras).length === 0;
    }
  }
  const out = [];
  for (const [catPath, map] of byCatBase.entries()) {
    const items = Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
    out.push({ category: catPath, items });
  }
  out.sort((a, b) => a.category.localeCompare(b.category));
  return out;
}

/* ---------------- PDF helpers (guarded) ---------------- */
function header(doc, appName, title, customerName) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;

  // obere Metazeile
  doc.save();
  doc.fillColor("#64748b").fontSize(10);
  doc.text(appName, left, doc.page.margins.top - 30, { width: 300, align: "left" });
  doc.text(new Date().toLocaleString("de-CH"), right - 300, doc.page.margins.top - 30, { width: 300, align: "right" });
  doc.restore();

  // Titelzeile
  doc.save();
  doc.fillColor("#111827").fontSize(18);
  doc.text(title, left, doc.page.margins.top - 8, { width: right - left, align: "left" });
  doc.restore();

  if (customerName) {
    doc.save();
    doc.fillColor("#334155").fontSize(12);
    doc.text(customerName, left, doc.page.margins.top + 14, { width: right - left, align: "left" });
    doc.restore();
  }

  // Trennlinie
  const y = doc.page.margins.top + (customerName ? 36 : 20);
  doc.moveTo(left, y).lineTo(right, y).strokeColor("#e5e7eb").stroke();

  // Cursor danach
  doc.y = y + 10;
}

function footer(doc) {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const y = doc.page.height - doc.page.margins.bottom + 10;

  doc.save();
  doc.fillColor("#94a3b8").fontSize(9);
  doc.text(`Seite ${doc.page.number}`, left, y, { width: right - left, align: "center" });
  doc.restore();
}

function ensureSpace(doc, need = 60) {
  if (doc.y + need > doc.page.height - doc.page.margins.bottom) {
    doc.addPage();
  }
}

function line(doc, color = "#e5e7eb") {
  doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor(color).stroke();
}

function textRow(doc, leftText, rightText, opts = {}) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const leftWidth = Math.min(Math.max(opts.leftWidth || 180, 120), width - 100);
  const gap = 12;
  const rightWidth = width - leftWidth - gap;

  const yStart = doc.y;
  const lh = opts.lh || 14;

  doc.save();
  doc.fontSize(opts.fs || 10).fillColor(opts.color || "#0f172a");
  doc.text(leftText, doc.page.margins.left, yStart, { width: leftWidth, align: "left" });
  doc.restore();

  doc.save();
  doc.fontSize(opts.fs || 10).fillColor(opts.color || "#0f172a");
  doc.text(rightText, doc.page.margins.left + leftWidth + gap, yStart, { width: rightWidth, align: "left" });
  doc.restore();

  // Höhe manuell erhöhen (keine automatische Umbrech-Logik nötig)
  doc.y = yStart + lh;
}

function bullets(doc, items, opts = {}) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left + (opts.indent || 0);
  const bulletGap = 6;
  const textWidth = width - (opts.indent || 0) - 10 - bulletGap;
  const fs = opts.fs || 10;

  for (const it of items) {
    ensureSpace(doc, fs * 2);
    const y = doc.y;
    doc.save();
    doc.circle(left + 3, y + 5, 2.2).fillColor("#64748b").fill();
    doc.restore();

    doc.save();
    doc.fillColor("#0f172a").fontSize(fs);
    doc.text(it, left + 10 + bulletGap, y, { width: textWidth, align: "left" });
    doc.restore();

    doc.y = y + fs + 4;
  }
}

/* --------------- Content builders ---------------- */
function rolesForPermission(roles, assignedSet, permId) {
  return roles.filter((r) => assignedSet.has(`${r.id}:${permId}`)).map((r) => r.name);
}

function renderCategory(doc, cat, roles, assignedSet, variant) {
  ensureSpace(doc, 40);
  doc.save();
  doc.fontSize(12).fillColor("#0f172a").text(cat.category, { align: "left" });
  doc.restore();

  doc.moveDown(0.2);
  line(doc, "#f1f5f9");
  doc.y += 4;

  for (const fn of cat.items) {
    ensureSpace(doc, 40);

    // Titel der Funktion
    doc.save();
    doc.fontSize(11).fillColor("#111827").text(fn.title, { align: "left" });
    doc.restore();

    // 1) Nur access
    if (fn.onlyAccess && fn.actions.access) {
      const names = rolesForPermission(roles, assignedSet, fn.actions.access.id);
      const right = names.length ? names.join(", ") : "—";
      textRow(doc, "Erlaubt", right, { fs: 10, leftWidth: 140, lh: 16 });
      if (variant === "admin") {
        textRow(doc, "Key", fn.actions.access.key, { fs: 9, color: "#64748b", leftWidth: 140, lh: 14 });
      }
      doc.y += 4;
      line(doc, "#f8fafc");
      doc.y += 8;
      continue;
    }

    // 2) Standard-Aktionen
    const stdOrder = ["access", "read", "edit", "create", "copy", "delete", "print"];
    const present = stdOrder.filter((k) => !!fn.actions[k]);

    for (const act of present) {
      const perm = fn.actions[act];
      const label = ACTION_LABEL[act] || act;
      const names = rolesForPermission(roles, assignedSet, perm.id);
      const right = names.length ? names.join(", ") : "—";
      textRow(doc, label, right, { fs: 10, leftWidth: 140, lh: 16 });
      if (variant === "admin") {
        textRow(doc, "Key", perm.key, { fs: 9, color: "#64748b", leftWidth: 140, lh: 14 });
      }
    }

    // 3) Extras
    const extraKeys = Object.keys(fn.extras).sort();
    if (extraKeys.length) {
      ensureSpace(doc, 28);
      doc.save();
      doc.fontSize(10).fillColor("#334155").text("Weitere Aktionen", { align: "left" });
      doc.restore();

      const lines = [];
      for (const code of extraKeys) {
        const perm = fn.extras[code];
        const names = rolesForPermission(roles, assignedSet, perm.id);
        const label = perm.description || code;
        const left = variant === "admin" ? `${label} (${perm.key})` : label;
        const right = names.length ? names.join(", ") : "—";
        lines.push(`${left}: ${right}`);
      }
      bullets(doc, lines, { indent: 12, fs: 10 });
    }

    doc.y += 4;
    line(doc, "#f8fafc");
    doc.y += 8;
  }
}

/* --------------- API logic ---------------- */
async function exportPdf(req, res) {
  const type = (req.query.type || "customer").toString();
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "SL-RoleDesk";

  let customerId = null;
  if (type === "admin") {
    if (!req.session?.admin) return res.status(403).json({ error: "Forbidden (Admin)" });
    customerId = req.query.customerId?.toString() || null;
    if (!customerId) return res.status(400).json({ error: "customerId erforderlich für type=admin" });
  } else {
    customerId = req.session?.customerId || null;
    if (!customerId) return res.status(401).json({ error: "Nicht eingeloggt" });
  }

  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true, name: true, code: true } });
  if (!customer) return res.status(404).json({ error: "Kunde nicht gefunden" });

  const [roles, permissions, assigned] = await Promise.all([
    prisma.role.findMany({ where: { customerId }, orderBy: { name: "asc" } }),
    prisma.permission.findMany({
      orderBy: [{ category: "asc" }, { key: "asc" }],
      select: { id: true, key: true, category: true, categoryPath: true, description: true },
    }),
    prisma.rolePermission.findMany({ where: { customerId } }),
  ]);

  const assignedSet = new Set(assigned.map((a) => `${a.roleId}:${a.permissionId}`));
  const cats = shapePermissions(permissions);

  const filename = `${appName.replace(/\s+/g, "")}_${customer.code || "kunde"}_${type}.pdf`;
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ size: "A4", margins: { top: 72, bottom: 54, left: 48, right: 48 }, autoFirstPage: true });
  doc.pipe(res);

  const title = type === "admin" ? "Rollen & Berechtigungen (Admin-Export)" : "Rollen & Berechtigungen";
  const subtitle = `${customer.name} (${customer.code || customer.id})`;

  // Seite 1: Header/Footer einmal setzen
  header(doc, appName, title, subtitle);
  footer(doc);

  // Guard, damit Header/Footer beim pageAdded nicht rekursiv weitere Seiten erzeugen
  let paintingHeaderFooter = false;
  doc.on("pageAdded", () => {
    if (paintingHeaderFooter) return;
    paintingHeaderFooter = true;
    try {
      header(doc, appName, title, subtitle);
      footer(doc);
    } finally {
      paintingHeaderFooter = false;
    }
  });

  // kleine Summary-Box (mit Platzprüfung)
  ensureSpace(doc, 48);
  const boxX = doc.page.margins.left;
  const boxW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const boxH = 36;
  const boxY = doc.y;

  doc.roundedRect(boxX, boxY, boxW, boxH, 8).fillAndStroke("#f8fafc", "#e5e7eb");
  doc.save();
  doc.fillColor("#0f172a").fontSize(10);
  doc.text(`Rollen: ${roles.length}`, boxX + 12, boxY + 10, { width: 220, align: "left" });
  doc.text(`Berechtigungen: ${permissions.length}`, boxX + 240, boxY + 10, { width: 240, align: "left" });
  doc.restore();

  doc.y = boxY + boxH + 12;

  for (const cat of cats) {
    renderCategory(doc, cat, roles, assignedSet, type === "admin" ? "admin" : "customer");
  }

  doc.end();
}

export default withApiSession(async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    await exportPdf(req, res);
  } catch (e) {
    console.error("PDF export error:", e);
    if (!res.headersSent) {
      res.status(500).json({ error: "Export fehlgeschlagen" });
    } else {
      try { res.end(); } catch {}
    }
  }
});
