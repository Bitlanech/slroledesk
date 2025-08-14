// Einheitliche Anzeige-Labels für Permissions

// Trennt "Funktionsname – Label" → nimmt Label; sonst null
function suffixFromDescription(desc) {
  if (!desc) return null;
  const ix = desc.indexOf(" – ");
  return ix > -1 ? desc.slice(ix + 3) : null;
}

// "belegstatus_setzen" / "belegstatussetzen" / "BelegStatusSetzen" → "Belegstatus setzen"
function humanizeCode(code = "") {
  if (!code) return "";
  let s = String(code);
  s = s.replace(/[_\-\.]+/g, " ");
  s = s.replace(/([a-z])([A-Z])/g, "$1 $2"); // camelCase trennen
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function labelForPermission(p, fallbackCode = "") {
  // 1) Wenn die CSV eine schöne Beschriftung in description gesetzt hat,
  //    nehmen wir den Teil NACH " – " (z. B. "Belegstatus setzen").
  const nice = suffixFromDescription(p?.description);
  if (nice && nice.trim()) return nice.trim();
  // 2) Fallback: aus Code hübsch machen
  return humanizeCode(fallbackCode || "");
}

// Optional nützlich, wenn du die Funktionsüberschrift brauchst:
export function titleFromPermission(p) {
  if (!p?.description) return p?.key || "";
  const ix = p.description.indexOf(" – ");
  return ix > -1 ? p.description.slice(0, ix) : p.description;
}
