import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { labelForPermission, titleFromPermission } from "@/lib/perm-label";

/**
 * Icon-Spalten + Rollen-Pills in Zellen.
 * Nutzt categoryPath aus der DB (CSV-Spaltenstruktur) – fällt auf category zurück.
 * Neu: "Erlaubt"-Spalte (access) wird dynamisch eingeblendet, wenn vorhanden.
 *      Wenn nur access existiert, sieht der Kunde nur "Erlaubt" (Allowed/Not allowed).
 */

const PARENTS = {
  read:   [],
  edit:   ["read"],
  create: ["edit", "read"],
  copy:   ["create", "edit", "read"],
  delete: ["edit", "read"],
  print:  ["read"]
};

function buildDescendants() {
  const children = { read: [], edit: [], create: [], copy: [], delete: [], print: [] };
  for (const [child, parents] of Object.entries(PARENTS)) {
    for (const p of parents) children[p].push(child);
  }
  const all = { ...children };
  const visit = (node, acc) => {
    for (const c of children[node]) {
      if (!acc.has(c)) { acc.add(c); visit(c, acc); }
    }
  };
  for (const k of Object.keys(all)) {
    const acc = new Set();
    visit(k, acc);
    all[k] = Array.from(acc);
  }
  return all;
}
const DESCENDANTS = buildDescendants();

function baseKeyOf(key) { const parts = String(key||"").split("."); parts.pop(); return parts.join("."); }
function actionOf(key) { const parts = String(key||"").split("."); return parts[parts.length-1] || ""; }
function functionTitle(p) { return titleFromPermission(p) || p?.key || ""; }

function partsFromPermission(p) {
  if (Array.isArray(p.categoryPath) && p.categoryPath.length) return p.categoryPath;
  return (p.category || "Allgemein").split("/").map(s=>s.trim()).filter(Boolean);
}

function buildTree(permissions) {
  const byCatBase = new Map();
  for (const p of permissions) {
    const catParts = partsFromPermission(p);
    const catPath = catParts.join(" / ");
    if (!byCatBase.has(catPath)) byCatBase.set(catPath, new Map());
    const base = baseKeyOf(p.key);
    const act  = actionOf(p.key);
    const map = byCatBase.get(catPath);
    if (!map.has(base)) {
      map.set(base, { base, title: functionTitle(p), category: catPath, categoryParts: catParts, actions: {}, extras: {} });
    }
    const g = map.get(base);
    if (["access","read","edit","create","copy","delete","print"].includes(act)) g.actions[act] = p;
    else g.extras[act] = p;
  }

  const root = { name: "__root__", path: "", children: new Map(), items: [] };
  for (const [catPath, groups] of byCatBase.entries()) {
    const parts = catPath.split(" / ").filter(Boolean);
    let cur = root; const agg = [];
    for (const part of (parts.length ? parts : ["Allgemein"])) {
      agg.push(part); const path = agg.join(" / ");
      if (!cur.children.has(part)) cur.children.set(part, { name: part, path, children: new Map(), items: [] });
      cur = cur.children.get(part);
    }
    cur.items.push(...Array.from(groups.values()).sort((a,b)=>a.title.localeCompare(b.title)));
  }
  return root;
}

function findNodeByPath(root, path) {
  if (!path?.trim()) return root;
  const parts = path.split("/").map(s=>s.trim()).filter(Boolean);
  let cur = root;
  for (const part of parts) {
    const child = cur.children.get(part);
    if (!child) return { name: part, path, children: new Map(), items: [] };
    cur = child;
  }
  return cur;
}

/* ---------- Popover Menüs ---------- */
function RoleAddMenu({ anchorEl, roles, onSelect, onClose }) {
  const [pos, setPos] = useState({ top:0, left:0, minWidth:160 });
  useState(() => {
    const rect = anchorEl?.getBoundingClientRect?.();
    if (rect) {
      const vw = window.innerWidth;
      const left = Math.min(rect.left, vw - 240);
      setPos({ top: rect.bottom + 6, left, minWidth: Math.max(160, rect.width) });
    }
  });
  return createPortal(
    <div style={{ position:"fixed", top:pos.top, left:pos.left, minWidth:pos.minWidth, zIndex:70 }}
         className="bg-white border border-edge rounded-lg shadow-card max-h-[50vh] overflow-auto">
      {roles.length ? roles.map(r => (
        <button key={r.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-soft" onClick={() => onSelect(r)}>
          {r.name}
        </button>
      )) : <div className="px-3 py-2 text-sm text-ink/50">Keine Rollen verfügbar</div>}
    </div>,
    document.body
  );
}

function RoleChips({ permission, roles, onToggle, disabled }) {
  const btnRef = useRef(null);
  const [open, setOpen] = useState(false);
  if (!permission) return null;

  const hasRole = (roleId) => roles.assignedSet.has(`${roleId}:${permission.id}`);
  const chosen = roles.list.filter(r => hasRole(r.id));
  const available = roles.list.filter(r => !hasRole(r.id));

  return (
    <div className="relative flex items-center gap-1 flex-wrap min-h-6">
      {chosen.map(r => (
        <span key={r.id} className="inline-flex items-center gap-1 h-6 px-2 rounded-full border border-brand/40 bg-brand/10 text-xs">
          {r.name}
          <button
            type="button"
            className={`-mr-1 rounded-full px-1 ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white"}`}
            onClick={() => !disabled && onToggle(r.id, false)}
            aria-label="Rolle entfernen"
            title="Rolle entfernen"
          >
            ×
          </button>
        </span>
      ))}

      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen(v=>!v)}
        className={`h-6 w-6 inline-flex items-center justify-center rounded-full border border-edge text-xs ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-soft"}`}
        aria-label="Rolle hinzufügen"
        title="Rolle hinzufügen"
      >
        +
      </button>

      {open && (
        <RoleAddMenu
          anchorEl={btnRef.current}
          roles={available}
          onSelect={(r)=>{ onToggle(r.id, true); setOpen(false); }}
          onClose={()=>setOpen(false)}
        />
      )}
    </div>
  );
}

/* ---------- Icons ---------- */
const HeadIcon = ({ title, path }) => (
  <div className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-soft" title={title} aria-label={title}>
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-ink/70">
      <path d={path} />
    </svg>
  </div>
);
const ICONS = {
  access: "M12 2a5 5 0 0 1 5 5v1h1a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V10a2 2 0 0 1 2-2h1V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v1h6V7a3 3 0 0 0-3-3Z", // Schloss
  read:   "M12 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm0-4c5.523 0 10 5.373 10 8s-4.477 8-10 8S2 12.627 2 10s4.477-8 10-8Zm0 14c3.866 0 7-3.134 7-6s-3.134-6-7-6-7 3.134-7 6 3.134 6 7 6Z",
  edit:   "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25ZM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z",
  create: "M11 2a1 1 0 0 1 1 1v8h8a1 1 0 1 1 0 2h-8v8a1 1 0 1 1-2 0v-8H2a1 1 0 1 1 0-2h8V3a1 1 0 0 1 1-1Z",
  copy:   "M8 7a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v9h-2V7H10v2H8V7Zm-3 3h9a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z",
  delete: "M9 3h6a1 1 0 0 1 1 1v1h5v2H3V5h5V4a1 1 0 0 1 1-1Zm-4 6h14l-1 11a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 9Z",
  print:  "M6 9V4h12v5h2a2 2 0 0 1 2 2v5h-4v4H8v-4H4v-5a2 2 0 0 1 2-2h0Zm2 11h8v-6H8v6Z",
  more:   "M6 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm8 0a2 2 0 1 1-4 0 2 2 0 0 1 4 0Zm6 2a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z"
};

function HeaderIcons({ columns }) {
  return (
    <tr>
      <th className="w-64 text-left text-xs font-semibold text-ink/60 px-3 py-2">Funktion</th>
      {columns.map(col => (
        <th key={col.key} className="text-center px-2 py-2">
          <HeadIcon title={col.title} path={ICONS[col.icon]} />
        </th>
      ))}
      <th className="w-12 text-right px-2 py-2 text-xs font-semibold text-ink/60">Quick</th>
    </tr>
  );
}

/* ---------- Zeilen ---------- */
function FunctionRow({ funcGroup, roles, assignedSet, onToggleUpstream, disabled, columns }) {
  const kebabRef = useRef(null);
  const [open, setOpen] = useState(false);

  const actionToPerm = {
    access: funcGroup.actions["access"],
    read:   funcGroup.actions["read"],
    edit:   funcGroup.actions["edit"],
    create: funcGroup.actions["create"],
    copy:   funcGroup.actions["copy"],
    delete: funcGroup.actions["delete"],
    print:  funcGroup.actions["print"]
  };

  const cascadeToggle = (roleId, actionCode, allow) => {
    if (actionCode === "access") {
      // keine Hierarchie
      const p = actionToPerm["access"];
      if (p) onToggleUpstream(roleId, p.id, allow);
      return;
    }

    const calls = [];
    const add = (code,val) => { const p=actionToPerm[code]; if (p) calls.push({ roleId, permissionId: p.id, allow: val }); };
    if (allow) { for (const p of (PARENTS[actionCode]||[])) add(p,true); add(actionCode,true); }
    else       { add(actionCode,false); for (const k of (DESCENDANTS[actionCode]||[])) add(k,false); }
    const seen = new Set();
    for (const c of calls) { const k = `${c.roleId}:${c.permissionId}:${c.allow}`; if (seen.has(k)) continue; seen.add(k); onToggleUpstream(c.roleId, c.permissionId, c.allow); }
  };

  const extras = Object.keys(funcGroup.extras).sort().map(code => ({ code, label: labelForPermission(funcGroup.extras[code], code), permission: funcGroup.extras[code] }));
  const allPerms = [
    ...columns.map(c => actionToPerm[c.key]).filter(Boolean),
    ...extras.map(e=>e.permission)
  ].filter(Boolean);

  const kebabItems = [
    { label: "Allen Rollen: alle Aktionen an", onClick: () => { for (const p of allPerms) for (const r of roles.list) onToggleUpstream(r.id, p.id, true); } },
    { label: "Allen Rollen: alle Aktionen aus", onClick: () => { for (const p of allPerms) for (const r of roles.list) onToggleUpstream(r.id, p.id, false); } },
    ...roles.list.map(r => {
      const total = allPerms.length;
      const count = allPerms.filter(p => assignedSet.has(`${r.id}:${p.id}`)).length;
      const next = !(total>0 && count===total);
      return { label: `${r.name}: ${next ? "alle Aktionen an" : "alle Aktionen aus"}`, onClick: () => { for (const p of allPerms) onToggleUpstream(r.id, p.id, next); } };
    })
  ];

  return (
    <>
      <tr className="border-t border-edge align-top">
        <td className="px-3 py-2 align-top">
          <div className="font-medium">{funcGroup.title}</div>
        </td>

        {columns.map(col => {
          const perm = actionToPerm[col.key];
          return (
            <td key={col.key} className="px-2 py-2 align-top">
              {perm ? (
                <RoleChips
                  permission={perm}
                  roles={{ list: roles.list, assignedSet }}
                  disabled={disabled}
                  onToggle={(roleId, allow) => cascadeToggle(roleId, col.key, allow)}
                />
              ) : null}
            </td>
          );
        })}

        <td className="px-2 py-2 text-right align-top">
          <button
            ref={kebabRef}
            type="button"
            className={`h-7 w-8 inline-flex items-center justify-center rounded-lg border border-edge ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-soft"}`}
            onClick={() => !disabled && setOpen(v=>!v)}
            aria-label="Schnellaktionen"
            title="Schnellaktionen"
          >
            ⋯
          </button>
          {open && createPortal(
            <div style={{ position:"fixed", zIndex:70, ...(() => { const r = kebabRef.current.getBoundingClientRect(); return { top:r.bottom+6, left:r.right-180, minWidth:180 }; })() }}
                 className="bg-white border border-edge rounded-lg shadow-card overflow-hidden">
              {kebabItems.map((it, i) => (
                <button key={i} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-soft" onClick={() => { it.onClick(); setOpen(false); }}>
                  {it.label}
                </button>
              ))}
            </div>,
            document.body
          )}
        </td>
      </tr>

      {/* Extras bleiben wie gehabt */}
      {Object.keys(funcGroup.extras).length > 0 && (
        <>
          <tr className="border-t border-edge">
            <td className="px-3 py-2 text-xs text-ink/60 flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-md">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5 text-ink/70">
                  <path d={ICONS.more} />
                </svg>
              </div>
              Weitere
            </td>
            {columns.map(col => (<td key={col.key} className="px-2 py-2" />))}
            <td className="px-2 py-2" />
          </tr>
          <tr className="align-top">
            <td className="px-3 pb-3" />
            <td colSpan={columns.length} className="px-2 pb-3">
              <div className="flex flex-wrap gap-3">
                {Object.keys(funcGroup.extras).sort().map(code => {
                  const e = funcGroup.extras[code];
                  return (
                    <div key={code} className="flex items-start gap-2">
                      <span className="inline-flex items-center h-6 px-2 rounded bg-soft border border-edge text-xs whitespace-nowrap">
                        {labelForPermission(e, code)}
                      </span>
                      <RoleChips
                        permission={e}
                        roles={{ list: roles.list, assignedSet }}
                        disabled={disabled}
                        onToggle={(roleId, allow) => onToggleUpstream(roleId, e.id, allow)}
                      />
                    </div>
                  );
                })}
              </div>
            </td>
            <td />
          </tr>
        </>
      )}
    </>
  );
}

/* ---------- Abschnitt ---------- */
function Section({ title, items, roles, assignedSet, onToggleUpstream, disabled }) {
  // Spalten dynamisch bestimmen:
  // - access zuerst, wenn mindestens eine Funktion ein access-Permission hat
  // - dann die Standardaktionen, aber nur, wenn sie in mindestens EINER Funktion vorkommen
  const hasAccess = items.some(it => !!it.actions.access);
  const candidates = [
    ...(hasAccess ? [{ key:"access", title:"Erlaubt", icon:"access" }] : []),
    { key:"read",   title:"Lesen",      icon:"read" },
    { key:"edit",   title:"Bearbeiten", icon:"edit" },
    { key:"create", title:"Anlegen",    icon:"create" },
    { key:"copy",   title:"Kopieren",   icon:"copy" },
    { key:"delete", title:"Entfernen",  icon:"delete" },
    { key:"print",  title:"Drucken",    icon:"print" },
  ];

  const columns = candidates.filter(col => items.some(it => !!it.actions[col.key]));

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 px-1 py-1">
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-ink/60">{items.length} Funktionen</div>
      </div>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <HeaderIcons columns={columns} />
          </thead>
          <tbody>
            {items.map(f => (
              <FunctionRow
                key={f.base}
                funcGroup={f}
                roles={{ list: roles, assignedSet }}
                assignedSet={assignedSet}
                onToggleUpstream={onToggleUpstream}
                disabled={disabled}
                columns={columns}
              />
            ))}
            {!items.length && (
              <tr><td colSpan={columns.length + 2} className="p-4 text-ink/60 text-sm">Keine Funktionen.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function FunctionMatrix({ roles, permissions, assigned, onToggle, disabled, rootPath }) {
  const tree = useMemo(() => buildTree(permissions), [permissions]);
  const node = useMemo(() => findNodeByPath(tree, rootPath || ""), [tree, rootPath]);
  const children = useMemo(() => Array.from(node.children.values()).sort((a,b)=>a.name.localeCompare(b.name)), [node]);

  const assignedSet = assigned; // Set("roleId:permissionId")

  return (
    <div className="space-y-2">
      {node.items?.length > 0 && (
        <Section
          title={node.path || "Allgemein"}
          items={node.items}
          roles={roles}
          assignedSet={assignedSet}
          onToggleUpstream={onToggle}
          disabled={disabled}
        />
      )}
      {children.map(ch => (
        <Section
          key={ch.name}
          title={ch.name}
          items={ch.items}
          roles={roles}
          assignedSet={assignedSet}
          onToggleUpstream={onToggle}
          disabled={disabled}
        />
      ))}
      {(!node.items?.length && !children.length) && (
        <div className="card p-4 text-ink/60 text-sm">Keine Funktionen in dieser Gruppe.</div>
      )}
    </div>
  );
}
