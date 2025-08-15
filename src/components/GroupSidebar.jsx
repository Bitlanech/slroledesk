import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tree-Sidebar mit Connector-Linien, nutzt bevorzugt permission.categoryPath (CSV-Spalten),
 * fällt ansonsten auf category-String zurück.
 * Änderung: Klick auf die Zeile wählt den Knoten aus; Chevron steuert Auf-/Zuklappen.
 */

function partsFromPermission(p) {
  if (Array.isArray(p.categoryPath) && p.categoryPath.length) return p.categoryPath;
  return String(p.category || "Allgemein").split("/").map(s=>s.trim()).filter(Boolean);
}

function buildTree(permissions) {
  const root = { name: "__root__", path: "", children: new Map(), hasItems: false, permissions: [] };
  const itemCountByPath = new Map();
  const permissionsByPath = new Map();

  for (const p of permissions || []) {
    const parts = partsFromPermission(p);
    let cur = root;
    const agg = [];
    for (const part of (parts.length ? parts : ["Allgemein"])) {
      agg.push(part);
      const path = agg.join(" / ");
      if (!cur.children.has(part)) {
        cur.children.set(part, { name: part, path, children: new Map(), hasItems: false, permissions: [] });
      }
      cur = cur.children.get(part);
    }
    // Merk dir, dass der Knoten Items hat (damit Elternknoten auswählbar sind)
    itemCountByPath.set(cur.path, (itemCountByPath.get(cur.path) || 0) + 1);
    // Speichere Berechtigungen für diese Gruppe
    if (!permissionsByPath.has(cur.path)) permissionsByPath.set(cur.path, []);
    permissionsByPath.get(cur.path).push(p);
  }

  // Flag hasItems und permissions setzen
  const setFlags = (node) => {
    if (itemCountByPath.has(node.path)) node.hasItems = true;
    if (permissionsByPath.has(node.path)) node.permissions = permissionsByPath.get(node.path);
    for (const child of node.children.values()) setFlags(child);
  };
  setFlags(root);

  return root;
}

function buildVisible(root, openSet) {
  const out = [];
  const visit = (node, depth, ancestorLastFlags = []) => {
    const entries = Array.from(node.children.values());
    entries.forEach((child, idx) => {
      const isLast = idx === entries.length - 1;
      const isOpen = openSet.has(child.name);
      out.push({ node: child, depth: depth + 1, isOpen, isLast, ancestorLast: ancestorLastFlags });
      if (isOpen) visit(child, depth + 1, [...ancestorLastFlags, isLast]);
    });
  };
  visit(root, 0, []);
  return out;
}

function Chevron({ open }) {
  return (
    <svg className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} viewBox="0 0 20 20" fill="currentColor">
      <path d="M7.293 14.707a1 1 0 0 1 0-1.414L10.586 10 7.293 6.707A1 1 0 1 1 8.707 5.293l4 4a1 1 0 0 1 0 1.414l-4 4a1 1 0 0 1-1.414 0Z" />
    </svg>
  );
}
function FolderIcon({ open, active }) {
  return (
    <svg className={`h-4 w-4 ${active ? "text-blue-600" : "text-gray-400"} shrink-0`} viewBox="0 0 24 24" fill="currentColor">
      {open ? (
        <>
          <path d="M3 7a3 3 0 0 1 3-3h3a2 2 0 0 1 1.414.586L12 6h6a3 3 0 0 1 3 3v1H3V7Z" />
          <path d="M3 10h18l-1.2 6a3 3 0 0 1-2.95 2.5H7.15A3 3 0 0 1 4.2 16.5L3 10Z" />
        </>
      ) : (
        <>
          <path d="M10 4a2 2 0 0 1 1.414.586L13 6h5a2 2 0 0 1 2 2v2H4V8a4 4 0 0 1 4-4h2Z" />
          <path d="M4 10h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6Z" />
        </>
      )}
    </svg>
  );
}

function Connectors({ depth, ancestorLast, isLast }) {
  const width = Math.max(0, depth - 1) * 14 + 14;
  const height = 24;
  const midY = height / 2;
  const lines = [];
  for (let i = 0; i < depth - 1; i++) {
    const x = i * 14 + 7;
    if (!ancestorLast[i]) {
      lines.push(<line key={`v-${i}`} x1={x} y1="0" x2={x} y2={height} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 2" />);
    }
  }
  const elbowX = (depth - 1) * 14 + 7;
  const elbow = (
    <>
      <line x1={elbowX} y1="0" x2={elbowX} y2={midY} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 2" />
      <line x1={elbowX} y1={midY} x2={elbowX + 10} y2={midY} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 2" />
      {!isLast && <line x1={elbowX} y1={midY} x2={elbowX} y2={height} stroke="#E5E7EB" strokeWidth="1" strokeDasharray="2 2" />}
    </>
  );
  return (
    <svg aria-hidden="true" className="shrink-0" width={width} height={height} style={{ minWidth: width, display: "block" }}>
      {lines}
      {depth > 0 && elbow}
    </svg>
  );
}

function checkIfIncomplete(node, roles, assigned) {
  // Rekursiv alle Berechtigungen in diesem Knoten und seinen Kindern sammeln
  const collectAllPermissions = (n) => {
    let perms = [...(n.permissions || [])];
    for (const child of n.children.values()) {
      perms = perms.concat(collectAllPermissions(child));
    }
    return perms;
  };
  
  const allPermissions = collectAllPermissions(node);
  
  if (allPermissions.length === 0) return false;
  if (!roles || roles.length === 0) return false;
  
  let hasAnyAssignment = false;
  let hasUnassignedPermissions = false;
  
  // Prüfe jede Berechtigung in dieser Gruppe
  allPermissions.forEach(perm => {
    let permissionHasAssignment = false;
    
    // Prüfe ob diese Berechtigung mindestens einer Rolle zugewiesen ist
    roles.forEach(role => {
      if (assigned.has(`${role.id}:${perm.id}`)) {
        hasAnyAssignment = true;
        permissionHasAssignment = true;
      }
    });
    
    // Wenn diese Berechtigung keiner Rolle zugewiesen ist
    if (!permissionHasAssignment) {
      hasUnassignedPermissions = true;
    }
  });
  
  // Gruppe ist unvollständig wenn:
  // - Mindestens eine Berechtigung wurde zugewiesen (Gruppe wurde begonnen)
  // - Es gibt noch Berechtigungen, die keiner Rolle zugewiesen sind
  return hasAnyAssignment && hasUnassignedPermissions;
}

function NodeRow({ node, depth, isOpen, isSelected, isLast, ancestorLast, toggle, select, hasChildren, isIncomplete, onContextMenu }) {
  return (
    <div
      role="treeitem"
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected || undefined}
      className={[
        "group relative flex items-center gap-1 px-1 h-8 rounded-md cursor-pointer",
        isSelected ? "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200" : "hover:bg-gray-50",
      ].join(" ")}
      title={node.path}
      // NEU: Klick wählt IMMER den Knoten aus (zeigt ggf. Items der Parent-Gruppe)
      onClick={() => select(node.path)}
      onContextMenu={(e) => {
        e.preventDefault();
        onContextMenu(e, node);
      }}
    >
      <Connectors depth={depth} ancestorLast={ancestorLast} isLast={isLast} />

      {/* Chevron steuert ausschließlich Auf-/Zuklappen */}
      {hasChildren ? (
        <button
          type="button"
          aria-label={isOpen ? "Zuklappen" : "Aufklappen"}
          onClick={(e) => { e.stopPropagation(); toggle(node.path); }}
          className="flex h-5 w-5 items-center justify-center text-gray-500 hover:text-gray-700 rounded"
        >
          <Chevron open={isOpen} />
        </button>
      ) : (
        <span className="h-5 w-5" />
      )}

      <FolderIcon open={!!isOpen} active={!!isSelected} />

      <span className={`truncate text-sm ${isSelected ? "font-semibold" : "text-gray-700"}`} style={{ maxWidth: "calc(100% - 64px)" }}>
        {node.name}
      </span>
      
      {isIncomplete && (
        <div 
          className="flex items-center justify-center w-5 h-5 rounded-full border-2 border-red-500 text-red-500 ml-auto mr-1" 
          title="Unvollständig bearbeitet - es gibt noch nicht zugewiesene Berechtigungen in dieser Gruppe"
        >
          <span className="text-xs font-bold">!</span>
        </div>
      )}
    </div>
  );
}

export default function GroupSidebar({ permissions, selectedPath, onSelect, roles = [], assigned = new Set(), onToggle, disabled = false }) {
  const root = useMemo(() => buildTree(permissions), [permissions]);
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);

  // Top-Level geöffnet
  const [open, setOpen] = useState(() => {
    const o = new Set();
    for (const [name] of root.children.entries()) o.add(name);
    return o;
  });

  // Beim Select: Eltern offen halten
  useEffect(() => {
    if (!selectedPath) return;
    const parts = String(selectedPath).split("/").map(s => s.trim()).filter(Boolean);
    if (!parts.length) return;
    setOpen(prev => {
      const next = new Set(prev);
      parts.forEach(p => next.add(p));
      return next;
    });
  }, [selectedPath]);

  const visible = useMemo(() => buildVisible(root, open), [root, open]);

  // Context Menu Handlers
  useEffect(() => {
    if (!contextMenu) return;
    
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu]);

  const handleContextMenu = (e, node) => {
    if (disabled || !onToggle) return;
    
    // Sammle alle Berechtigungen in dieser Gruppe
    const collectAllPermissions = (n) => {
      let perms = [...(n.permissions || [])];
      for (const child of n.children.values()) {
        perms = perms.concat(collectAllPermissions(child));
      }
      return perms;
    };
    
    const groupPermissions = collectAllPermissions(node);
    if (groupPermissions.length === 0) return;
    
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      node,
      permissions: groupPermissions
    });
  };

  const handleAllowAll = () => {
    if (!contextMenu) return;
    contextMenu.permissions.forEach(perm => {
      roles.forEach(role => {
        if (!assigned.has(`${role.id}:${perm.id}`)) {
          onToggle(role.id, perm.id, true);
        }
      });
    });
    setContextMenu(null);
  };

  const handleDenyAll = () => {
    if (!contextMenu) return;
    contextMenu.permissions.forEach(perm => {
      roles.forEach(role => {
        if (assigned.has(`${role.id}:${perm.id}`)) {
          onToggle(role.id, perm.id, false);
        }
      });
    });
    setContextMenu(null);
  };

  const handleAllowAllForRole = (roleId) => {
    if (!contextMenu) return;
    contextMenu.permissions.forEach(perm => {
      if (!assigned.has(`${roleId}:${perm.id}`)) {
        onToggle(roleId, perm.id, true);
      }
    });
    setContextMenu(null);
  };

  const handleDenyAllForRole = (roleId) => {
    if (!contextMenu) return;
    contextMenu.permissions.forEach(perm => {
      if (assigned.has(`${roleId}:${perm.id}`)) {
        onToggle(roleId, perm.id, false);
      }
    });
    setContextMenu(null);
  };

  const toggle = (path) => {
    const parts = String(path).split("/").map(s=>s.trim()).filter(Boolean);
    const key = parts[parts.length - 1];
    setOpen(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const select = (path) => onSelect?.(path);

  // Tastatur: Enter/Space = select; Pfeile rechts/links = auf/zu
  const containerRef = useRef(null);
  const handleKeyDown = (e) => {
    const items = containerRef.current?.querySelectorAll('[role="treeitem"]') || [];
    if (!items.length) return;
    const idx = Array.from(items).findIndex((el) => el.getAttribute("title") === selectedPath);
    const first = 0;
    const last = items.length - 1;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      const n = Math.min((idx + 1), last);
      const el = items[n];
      const path = el?.getAttribute("title");
      if (path) select(path);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const p = Math.max((idx - 1), first);
      const el = items[p];
      const path = el?.getAttribute("title");
      if (path) select(path);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const parts = String(selectedPath || "").split("/").map(s=>s.trim()).filter(Boolean);
      const key = parts[parts.length - 1];
      if (key && !open.has(key)) toggle(selectedPath);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const parts = String(selectedPath || "").split("/").map(s=>s.trim()).filter(Boolean);
      const key = parts[parts.length - 1];
      if (key && open.has(key)) toggle(selectedPath);
      else if (parts.length > 1) select(parts.slice(0, -1).join(" / "));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (selectedPath) select(selectedPath);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-2">
      <div className="px-2 pt-1 pb-2 text-xs font-medium text-gray-500">Gruppen</div>
      <div ref={containerRef} role="tree" tabIndex={0} onKeyDown={handleKeyDown} className="max-h-[70vh] overflow-auto outline-none">
        {visible.length === 0 && <div className="px-2 py-3 text-sm text-gray-500">Keine Gruppen gefunden.</div>}
        <div className="space-y-[2px]">
          {visible.map((v) => {
            const hasChildren = v.node.children.size > 0;
            const isSelected = v.node.path === selectedPath;
            const isIncomplete = checkIfIncomplete(v.node, roles, assigned);
            return (
              <NodeRow
                key={v.node.path}
                node={v.node}
                depth={v.depth}
                isOpen={!!v.isOpen}
                isLast={v.isLast}
                ancestorLast={v.ancestorLast}
                isSelected={isSelected}
                toggle={toggle}
                select={select}
                hasChildren={hasChildren}
                isIncomplete={isIncomplete}
                onContextMenu={handleContextMenu}
              />
            );
          })}
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && createPortal(
        <>
          <div 
            className="fixed inset-0 z-[99]" 
            onClick={() => setContextMenu(null)}
            style={{ background: 'transparent' }}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]"
            style={{ 
              top: contextMenu.y, 
              left: Math.min(contextMenu.x, window.innerWidth - 250)
            }}
          >
            <div className="px-3 py-1 text-xs font-medium text-gray-500 border-b">
              {contextMenu.node.name}
            </div>
            
            {/* Allgemeine Aktionen */}
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={handleAllowAll}
            >
              ✓ Allen Rollen erlauben
            </button>
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
              onClick={handleDenyAll}
            >
              ✗ Allen Rollen verbieten
            </button>
            
            {/* Rollenspezifische Aktionen */}
            {roles.length > 0 && (
              <>
                <div className="border-t my-1" />
                <div className="px-3 py-1 text-xs font-medium text-gray-500">
                  Nach Rolle
                </div>
                {roles.map(role => (
                  <div key={role.id}>
                    <button
                      className="w-full text-left px-3 py-1 text-sm hover:bg-gray-50"
                      onClick={() => handleAllowAllForRole(role.id)}
                    >
                      ✓ {role.name}: erlauben
                    </button>
                    <button
                      className="w-full text-left px-3 py-1 text-sm hover:bg-gray-50"
                      onClick={() => handleDenyAllForRole(role.id)}
                    >
                      ✗ {role.name}: verbieten
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
