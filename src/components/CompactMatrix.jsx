import { useMemo, useState } from "react";

// Ermittelt Basis-Key = alles vor der letzten Aktion (z. B. "…auftrag.read" -> "…auftrag")
function baseOf(key) {
  const parts = String(key || "").split(".");
  if (parts.length <= 1) return key;
  parts.pop();
  return parts.join(".");
}
// Versucht, einen sprechenden Namen aus description zu ziehen (vor " – ")
function titleOf(p) {
  const d = p.description || "";
  const ix = d.indexOf(" – ");
  return ix > -1 ? d.slice(0, ix) : d || p.key;
}
// Aktion = letzter Segmentteil
function actionOf(key) {
  const parts = String(key || "").split(".");
  return parts[parts.length - 1] || "";
}

// Gruppieren: nach Kategorie und Basis-Key
function groupPermissions(permissions) {
  const byCat = new Map();
  for (const p of permissions) {
    const cat = (p.category || "Allgemein").trim();
    if (!byCat.has(cat)) byCat.set(cat, new Map());
    const byBase = byCat.get(cat);
    const base = baseOf(p.key);
    if (!byBase.has(base)) byBase.set(base, { base, title: titleOf(p), items: [] });
    byBase.get(base).items.push({ ...p, action: actionOf(p.key) });
  }
  // sortiert zurückgeben
  return Array.from(byCat.entries()).map(([cat, map]) => {
    const groups = Array.from(map.values()).sort((a,b) => a.title.localeCompare(b.title));
    return { category: cat, groups };
  }).sort((a,b) => a.category.localeCompare(b.category));
}

function Pill({ state = "none", onClick, disabled }) {
  const cls =
    state === "all" ? "bg-brand text-white border-transparent"
    : state === "some" ? "bg-soft text-ink border-brand/40"
    : "bg-white text-ink border-edge";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-7 min-w-16 px-3 rounded-full border text-xs ${disabled ? "opacity-50 cursor-not-allowed" : "hover:opacity-90"} ${cls}`}
      title={state === "all" ? "Alle Aktionen zugewiesen" : state === "some" ? "Teilweise zugewiesen" : "Keine Zuweisung"}
    >
      {state === "all" ? "Alle" : state === "some" ? "Teilweise" : "Keine"}
    </button>
  );
}

function GroupRow({ group, roles, assigned, onToggle, disabled }) {
  const [open, setOpen] = useState(false);

  // Status je Rolle berechnen
  const roleState = (roleId) => {
    const total = group.items.length;
    let count = 0;
    for (const item of group.items) {
      if (assigned.has(`${roleId}:${item.id}`)) count++;
    }
    if (count === 0) return "none";
    if (count === total) return "all";
    return "some";
  };

  const setAllForRole = (roleId, next) => {
    for (const item of group.items) onToggle(roleId, item.id, next);
  };

  const setAllForAllRoles = (next) => {
    for (const r of roles) setAllForRole(r.id, next);
  };

  return (
    <div className="border-b border-edge">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setOpen(!open)} className="btn" aria-label="Details">
            {open ? "▾" : "▸"}
          </button>
          <div className="font-medium">{group.title}</div>
          <div className="text-xs text-ink/60">{group.items.length} Aktionen</div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/60">Alle Rollen</span>
          <Pill
            state={(function(){
              const totals = roles.map(r => roleState(r.id));
              if (totals.every(s => s === "all")) return "all";
              if (totals.every(s => s === "none")) return "none";
              return "some";
            })()}
            onClick={() => {
              const currentAll = roles.every(r => roleState(r.id) === "all");
              setAllForAllRoles(!currentAll);
            }}
            disabled={disabled}
          />
          {roles.map(r => (
            <Pill
              key={r.id}
              state={roleState(r.id)}
              onClick={() => {
                const s = roleState(r.id);
                setAllForRole(r.id, !(s === "all"));
              }}
              disabled={disabled}
            />
          ))}
        </div>
      </div>

      {open && (
        <div className="px-3 pb-3">
          <div className="overflow-x-auto rounded-lg border border-edge">
            <table className="table">
              <thead>
                <tr>
                  <th>Aktion</th>
                  {roles.map(r => <th key={r.id} className="text-center">{r.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {group.items.map((p, idx) => (
                  <tr key={p.id} className={idx % 2 ? "bg-soft/40" : ""}>
                    <td className="py-2">{p.description || p.key}</td>
                    {roles.map(r => {
                      const k = `${r.id}:${p.id}`;
                      const checked = assigned.has(k);
                      return (
                        <td key={r.id} className="text-center">
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={disabled}
                            onChange={(e) => onToggle(r.id, p.id, e.target.checked)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CompactMatrix({ roles, permissions, assigned, onToggle, disabled }) {
  const cats = useMemo(() => groupPermissions(permissions), [permissions]);
  return (
    <div className="space-y-4">
      {cats.map(cat => (
        <div key={cat.category} className="card">
          <div className="px-4 py-3 border-b border-edge font-semibold">{cat.category}</div>
          <div className="divide-y divide-edge">
            {cat.groups.map(g => (
              <GroupRow
                key={g.base}
                group={g}
                roles={roles}
                assigned={assigned}
                onToggle={onToggle}
                disabled={disabled}
              />
            ))}
            {!cat.groups.length && <div className="p-4 text-ink/60 text-sm">Keine Berechtigungen.</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
