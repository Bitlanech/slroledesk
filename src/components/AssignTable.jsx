import { useMemo } from "react";

export default function AssignTable({
  roles,
  permissions,
  assigned,
  onToggle,
  disabled
}) {
  const grouped = useMemo(() => {
    const map = new Map();
    permissions.forEach(p => {
      const cat = p.category || "Allgemein";
      const arr = map.get(cat) || [];
      arr.push(p);
      map.set(cat, arr);
    });
    return Array.from(map.entries()).sort(([a],[b]) => a.localeCompare(b));
  }, [permissions]);

  return (
    <div className="overflow-x-auto border rounded-2xl">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3">Permission</th>
            <th className="text-left p-3">Beschreibung</th>
            {roles.map(r => (
              <th key={r.id} className="p-3 text-center">{r.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grouped.map(([cat, rows]) => (
            <>
              <tr key={`cat-${cat}`}>
                <td colSpan={2 + roles.length} className="bg-gray-100 font-medium p-2">{cat}</td>
              </tr>
              {rows.map(p => (
                <tr key={p.id} className="border-t">
                  <td className="p-3 font-mono">{p.key}</td>
                  <td className="p-3">{p.description}</td>
                  {roles.map(r => {
                    const k = `${r.id}:${p.id}`;
                    const checked = assigned.has(k);
                    return (
                      <td key={r.id} className="p-3 text-center">
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
            </>
          ))}
        </tbody>
      </table>
    </div>
  );
}
