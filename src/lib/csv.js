// CSV-Parser mit Kanonisierung + robuster De-Duplizierung + categoryPath
// Erwartete Kopfzeile:
// Gruppe;SubGruppe1;SubGruppe2;SubGruppe3;SubGruppe4;SubGruppe5;Berechtigungsname;Erlaubt;Lesen;Bearbeiten;Hinzufügen;Kopieren;Löschen;Drucken;Weitere

const SEP = ";";

// normalize: lowercase, NFKD, diakritika raus, alles außer a-z0-9 entfernen
export function normalizeToken(s = "") {
  return String(s || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function cleanLabel(s = "") {
  // NBSP & alle Whitespaces zu normalen Spaces, Mehrfachspaces zusammenfassen
  return String(s || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truthy(v) {
  const s = String(v || "").trim().toLowerCase();
  return ["1", "true", "wahr", "ja", "j", "x", "y", "yes"].includes(s);
}

function nonEmpty(v) {
  return String(v || "").trim().length > 0;
}

function buildCategoryPath(group, subs) {
  // Wichtig: NICHT am Slash splitten, Spalten sind maßgeblich
  const parts = [String(group || "").trim(), ...subs.map(s => String(s || "").trim())]
    .filter(Boolean);
  return parts; // z. B. ["Anwendungen / Module"] oder ["Daten","Anlagen"]
}

function buildCategory(group, subs) {
  // Für DB/Anzeige weiterhin ein String (zurückwärtskompatibel)
  return buildCategoryPath(group, subs).join(" / ");
}

function buildBaseKey(group, subs, name) {
  // Erstes Segment: normalisierte Gruppe; danach Subgruppen; dann Funktionsname
  const parts = [normalizeToken(group)];
  for (const s of subs) parts.push(normalizeToken(s));
  parts.push(normalizeToken(name));
  return parts.filter(Boolean).join(".");
}

const STANDARD = [
  { csv: "Erlaubt",    code: "access"   },
  { csv: "Lesen",      code: "read"     },
  { csv: "Bearbeiten", code: "edit"     },
  { csv: "Hinzufügen", code: "create"   },
  { csv: "Kopieren",   code: "copy"     },
  { csv: "Löschen",    code: "delete"   },
  { csv: "Drucken",    code: "print"    },
];

export function parseCsv(buffer) {
  const text = buffer.toString("utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  if (!lines.length) throw new Error("Leere CSV.");

  const header = lines[0].split(SEP).map((h) => h.trim());
  const idx = {};
  header.forEach((h, i) => (idx[h] = i));

  const required = [
    "Gruppe", "SubGruppe1", "SubGruppe2", "SubGruppe3", "SubGruppe4", "SubGruppe5",
    "Berechtigungsname",
    "Erlaubt", "Lesen", "Bearbeiten", "Hinzufügen", "Kopieren", "Löschen", "Drucken",
    "Weitere",
  ];
  for (const r of required) {
    if (!(r in idx)) throw new Error(`Spalte fehlt: ${r}`);
  }

  const pendingRows = [];

  for (let li = 1; li < lines.length; li++) {
    const raw = lines[li];
    const cols = raw.split(SEP);
    if (cols.length < header.length) continue;

    const group = cols[idx["Gruppe"]] || "";
    const subs = [
      cols[idx["SubGruppe1"]], cols[idx["SubGruppe2"]], cols[idx["SubGruppe3"]],
      cols[idx["SubGruppe4"]], cols[idx["SubGruppe5"]],
    ];
    const name = cols[idx["Berechtigungsname"]] || "";

    const categoryPath = buildCategoryPath(group, subs);
    const category = buildCategory(group, subs);
    const baseKey = buildBaseKey(group, subs, name);

    const functionTitle = `${name}`.trim();
    const descriptionPrefix = functionTitle ? `${functionTitle} – ` : "";

    // Standardaktionen (nur wenn CSV wahr)
    for (const st of STANDARD) {
      const val = cols[idx[st.csv]];
      if (truthy(val)) {
        const key = `${baseKey}.${st.code}`;
        pendingRows.push({
          key,
          category,
          categoryPath, // << wichtig
          description: `${descriptionPrefix}${st.csv}`,
          baseKey,
          actionCode: st.code,
        });
      }
    }

    // Weitere: dedupliziert pro Zeile nach kanonischem Aktionscode
    const w = cols[idx["Weitere"]] || "";
    if (nonEmpty(w)) {
      const parts = w.split(",").map(cleanLabel).filter(Boolean);
      const perRow = new Map(); // actionCode -> label (letzter gewinnt)
      for (const label of parts) {
        const actionCode = normalizeToken(label);
        if (!actionCode) continue;
        perRow.set(actionCode, label);
      }
      for (const [actionCode, label] of perRow.entries()) {
        const key = `${baseKey}.${actionCode}`;
        pendingRows.push({
          key,
          category,
          categoryPath, // << wichtig
          description: `${descriptionPrefix}${label}`,
          baseKey,
          actionCode,
        });
      }
    }
  }

  // Dateiweite De-Duplizierung: gleicher Key -> letzter gewinnt
  const byKey = new Map();
  for (const row of pendingRows) byKey.set(row.key, row);
  const rows = Array.from(byKey.values());
  return { rows };
}
