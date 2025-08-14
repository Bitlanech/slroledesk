import { useState } from "react";

export default function RoleManager({ roles, onChanged, disabled }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");

  const createRole = async () => {
    setErr("");
    const trimmed = name.trim();
    if (!trimmed) return;
    const res = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed })
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setName(""); onChanged && onChanged(); }
    else setErr(j.error || "Rolle konnte nicht angelegt werden.");
  };

  const renameRole = async (id, newName) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await fetch("/api/roles", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: trimmed })
    });
    onChanged && onChanged();
  };

  const deleteRole = async (id) => {
    if (!confirm("Rolle wirklich löschen? Zuweisungen dieser Rolle werden entfernt.")) return;
    await fetch("/api/roles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    onChanged && onChanged();
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Rollen verwalten</h2>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Neue Rolle (z. B. Vertrieb)"
          className="input w-full"
          disabled={disabled}
        />
        <button type="button" onClick={createRole} disabled={disabled} className="btn btn-primary">
          + Rolle
        </button>
      </div>
      {err && <div className="text-red-700 text-sm mt-2">{err}</div>}

      <div className="mt-3 overflow-x-auto rounded-lg border border-edge">
        <table className="table">
          <thead>
            <tr>
              <th className="w-3/4">Name</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {roles.map(r => (
              <tr key={r.id} className="border-t border-edge">
                <td>
                  <input
                    defaultValue={r.name}
                    onBlur={(e) => renameRole(r.id, e.target.value)}
                    className="input w-full"
                    disabled={disabled}
                  />
                </td>
                <td className="text-right">
                  <button type="button" onClick={() => deleteRole(r.id)} disabled={disabled} className="btn">
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {!roles.length && (
              <tr><td colSpan={2} className="p-3 text-ink/60">Keine Rollen vorhanden. Lege oben eine neue Rolle an.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
