import { useMemo, useState } from "react";

function buildTree(permissions) {
  const root = { name: "__root__", children: new Map(), items: [] };
  for (const p of permissions) {
    const parts = (p.category || "Allgemein").split("/").map(s => s.trim()).filter(Boolean);
    let node = root;
    for (const part of parts) {
      if (!node.children.has(part)) node.children.set(part, { name: part, children: new Map(), items: [] });
      node = node.children.get(part);
    }
    node.items.push(p);
  }
  return root;
}

function Node({ node, roles, assigned, onToggle, disabled, defaultExpanded = true }) {
  const [open, setOpen] = useState(defaultExpanded);
  const children = Array.from(node.children.values());

  const toggleGroupForAllRoles = (next) => {
    const stack = [node];
    while (stack.length) {
      const cur = stack.pop();
      for (const p of cur.items) {
        for (const r of roles) onToggle(r.id, p.id, next);
      }
      for (const c of cur.children.values()) stack.push(c);
    }
  };

  return (
    <div className="card mb-3">
      {node.name !== "__root__" && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-edge bg-white/60 backdrop-blur">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setOpen(!open)} className="btn">
              {open ? "▾" : "▸"}
            </button>
            <div className="font-semibold">{node.name}</div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button type="button" disabled={disabled} onClick={() => toggleGroupForAllRoles(true)} className="btn">
              Allen Rollen zuweisen
            </button>
            <button type="button" disabled={disabled} onClick={() => toggleGroupForAllRoles(false)} className="btn">
              Allen Rollen entziehen
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="p-3">
          {node.items.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-edge">
              <table className="table">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th className="w-1/2">Berechtigung</th>
                    <th className="text-center">Alle Rollen</th>
                    {roles.map(r => <th key={r.id} className="text-center">{r.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {node.items.map((p, idx) => {
                    const allChecked = roles.every(r => assigned.has(`${r.id}:${p.id}`));
                    const someChecked = roles.some(r => assigned.has(`${r.id}:${p.id}`));
                    return (
                      <tr key={p.id} className={idx % 2 ? "bg-soft/40" : ""}>
                        <td className="py-2">{p.description || p.key}</td>
                        <td className="text-center">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={el => { if (el) el.indeterminate = !allChecked && someChecked; }}
                            disabled={disabled}
                            onChange={(e) => { for (const r of roles) onToggle(r.id, p.id, e.target.checked); }}
                          />
                        </td>
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
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {children.length > 0 && (
            <div className="mt-3 space-y-3">
              {children.map((child) => (
                <Node
                  key={child.name}
                  node={child}
                  roles={roles}
                  assigned={assigned}
                  onToggle={onToggle}
                  disabled={disabled}
                  defaultExpanded={false}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TreeMatrix({ roles, permissions, assigned, onToggle, disabled }) {
  const tree = useMemo(() => buildTree(permissions), [permissions]);
  const top = Array.from(tree.children.values());

  return (
    <div className="space-y-2">
      {top.map(t => (
        <Node
          key={t.name}
          node={t}
          roles={roles}
          assigned={assigned}
          onToggle={onToggle}
          disabled={disabled}
          defaultExpanded={true}
        />
      ))}
    </div>
  );
}
