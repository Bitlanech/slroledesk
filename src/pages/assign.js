import { useEffect, useMemo, useRef, useState } from "react";
import CustomerCard from "@/components/CustomerCard";
import LockBanner from "@/components/LockBanner";
import GroupSidebar from "@/components/GroupSidebar";
import FunctionMatrix from "@/components/FunctionMatrix";
import RoleManager from "@/components/RoleManager";
import ExportPdfButtons from "@/components/ExportPdfButtons";
import Link from "next/link";

export default function Assign() {
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [assigned, setAssigned] = useState(new Set());
  const [lockedAt, setLockedAt] = useState(null);
  const [draftSavedAt, setDraftSavedAt] = useState(null);
  const [assignVersion, setAssignVersion] = useState(0); // <-- Versionsstand vom Server
  const [customer, setCustomer] = useState(null);

  const [q, setQ] = useState("");
  const [selectedPath, setSelectedPath] = useState("");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");

  const [pendingChanges, setPendingChanges] = useState([]); // {roleId, permissionId, allow}
  const [isSaving, setIsSaving] = useState(false);

  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);

  const disabled = !!lockedAt;
  const autoSaveTimer = useRef(null);

  const loadSession = async () => {
    const sRes = await fetch("/api/session");
    const sJson = await sRes.json().catch(() => ({}));
    if (!sRes.ok || !sJson?.authenticated) { window.location.href = "/"; return; }
    setCustomer(sJson.customer || null);
  };
  const loadRoles = async () => {
    const r = await fetch("/api/roles");
    if (r.status === 401) { window.location.href = "/"; return; }
    const j = await r.json().catch(() => ({}));
    setRoles(j.roles || []);
  };
  const loadMatrix = async () => {
    const res = await fetch("/api/permissions");
    if (!res.ok) { window.location.href = "/"; return; }
    const j = await res.json();
    setPermissions(j.permissions || []);
    setAssigned(new Set(j.assigned || []));
    setLockedAt(j.lockedAt || null);
    setDraftSavedAt(j.draftSavedAt || null);
    setAssignVersion(typeof j.assignVersion === "number" ? j.assignVersion : 0);
  };

  useEffect(() => { (async () => {
    await loadSession(); await loadRoles(); await loadMatrix(); setLoading(false);
  })(); }, []);

  // Warnung beim Verlassen (ungespeichert)
  useEffect(() => {
    const hasPending = pendingChanges.length > 0 && !disabled;
    const handler = (e) => {
      if (hasPending) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [pendingChanges.length, disabled]);

  // Toggle aus Matrix
  const onToggle = (roleId, permissionId, allow) => {
    const key = `${roleId}:${permissionId}`;
    setAssigned(prev => {
      const was = prev.has(key);
      const ns = new Set(prev);
      if (allow) ns.add(key); else ns.delete(key);
      setUndoStack(s => [...s, { roleId, permissionId, prev: was, next: allow }]);
      setRedoStack([]); // redo invalidieren
      setPendingChanges(ch => [...ch, { roleId, permissionId, allow }]);
      return ns;
    });
  };

  const onUndo = () => {
    if (!undoStack.length || disabled) return;
    const last = undoStack[undoStack.length - 1];
    const { roleId, permissionId, prev, next } = last;
    const key = `${roleId}:${permissionId}`;
    setAssigned(prevSet => {
      const ns = new Set(prevSet);
      if (prev) ns.add(key); else ns.delete(key);
      return ns;
    });
    setPendingChanges(ch => [...ch, { roleId, permissionId, allow: prev }]);
    setUndoStack(st => st.slice(0, -1));
    setRedoStack(st => [...st, last]);
  };

  const onRedo = () => {
    if (!redoStack.length || disabled) return;
    const last = redoStack[redoStack.length - 1];
    const { roleId, permissionId, prev, next } = last;
    const key = `${roleId}:${permissionId}`;
    setAssigned(prevSet => {
      const ns = new Set(prevSet);
      if (next) ns.add(key); else ns.delete(key);
      return ns;
    });
    setPendingChanges(ch => [...ch, { roleId, permissionId, allow: next }]);
    setRedoStack(st => st.slice(0, -1));
    setUndoStack(st => [...st, last]);
  };

  // Auto-Save alle 30s
  useEffect(() => {
    if (disabled) return;
    if (autoSaveTimer.current) clearInterval(autoSaveTimer.current);
    autoSaveTimer.current = setInterval(async () => {
      if (pendingChanges.length && !isSaving) {
        await onSaveDraft(true);
      }
    }, 30000);
    return () => { if (autoSaveTimer.current) clearInterval(autoSaveTimer.current); };
  }, [pendingChanges.length, disabled, isSaving]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save Draft (mit Versionsprüfung)
  const onSaveDraft = async (silent = false) => {
    if (!pendingChanges.length || disabled) {
      if (!silent) setInfo("Keine Änderungen.");
      return;
    }
    setIsSaving(true);
    if (!silent) { setInfo(""); setError(""); }
    try {
      const res = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: pendingChanges, clientVersion: assignVersion })
      });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Konflikt
        setError("Konflikt: Ein anderer Benutzer hat zwischengespeichert. Letzte Version wird geladen.");
        await loadMatrix(); // lädt auch neue assignVersion
        // Pending-Änderungen NICHT verwerfen – der Nutzer kann erneut speichern.
        return;
      }
      if (res.ok) {
        setPendingChanges([]);
        if (typeof j.assignVersion === "number") setAssignVersion(j.assignVersion);
        setDraftSavedAt(j.draftSavedAt || new Date().toISOString());
        if (!silent) setInfo(`Zwischengespeichert (${j.saved} Änderungen).`);
      } else {
        if (!silent) setError(j.error || "Zwischenspeichern fehlgeschlagen.");
      }
    } catch (_e) {
      if (!silent) setError("Netzwerkfehler beim Zwischenspeichern.");
    } finally {
      setIsSaving(false);
    }
  };

  // Final Submit (mit Versionsprüfung)
  const onSubmit = async () => {
    setInfo(""); setError("");
    // offene Deltas mitschicken
    if (pendingChanges.length) {
      const resSave = await fetch("/api/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changes: pendingChanges, clientVersion: assignVersion })
      });
      if (resSave.status === 409) {
        setError("Konflikt vor dem Einreichen: Bitte Seite aktualisieren oder erneut speichern.");
        await loadMatrix();
        return;
      }
      if (!resSave.ok) {
        const j = await resSave.json().catch(() => ({}));
        setError(j.error || "Zwischenspeichern vor dem Einreichen fehlgeschlagen.");
        return;
      }
      setPendingChanges([]);
      const j1 = await resSave.json().catch(() => ({}));
      if (typeof j1.assignVersion === "number") setAssignVersion(j1.assignVersion);
    }

    const items = Array.from(assigned).map(k => {
      const [roleId, permissionId] = k.split(":");
      return { roleId, permissionId };
    });

    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items, clientVersion: assignVersion })
    });
    const j = await res.json().catch(() => ({}));
    if (res.status === 409) {
      setError("Konflikt beim Einreichen: Änderungen eines anderen Benutzers vorhanden. Bitte neu laden.");
      await loadMatrix();
      return;
    }
    if (res.ok) {
      setLockedAt(j.lockedAt || new Date().toISOString());
      if (typeof j.assignVersion === "number") setAssignVersion(j.assignVersion);
      setInfo("Erfolgreich eingereicht. Datensatz ist nun gesperrt.");
    } else {
      setError(j.error || "Einreichen fehlgeschlagen.");
    }
  };

  const onRolesChanged = async () => { await loadRoles(); };

  const filteredPermissions = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return permissions;
    return permissions.filter(p => {
      const hay = [p.description || "", p.category || "", p.key || ""].join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [permissions, q]);

  useEffect(() => {
    if (!selectedPath && filteredPermissions.length) {
      const cats = new Set(filteredPermissions.map(p => (p.category || "Allgemein").split("/").map(s=>s.trim())[0] || "Allgemein"));
      const first = Array.from(cats).sort()[0];
      if (first) setSelectedPath(first);
    }
  }, [filteredPermissions, selectedPath]);

  if (loading) return <div className="p-6">Lade…</div>;

  const hasPending = pendingChanges.length > 0;
  const draftLabel = draftSavedAt ? new Date(draftSavedAt).toLocaleString() : "—";

  return (
    <div className="space-y-4">
      <CustomerCard customer={{ ...customer, lockedAt }} />
      <LockBanner lockedAt={lockedAt} />

      <div className="card p-3">
        <div className="flex flex-col md:flex-row md:items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold">Rollen & Berechtigungen</h1>
            <ExportPdfButtons mode="customer" />
            <span className="text-xs text-ink/60">Zuletzt zwischengespeichert: {draftLabel}</span>
            <span className="text-xs text-ink/60">Version: {assignVersion}</span>
            {isSaving && <span className="text-xs text-ink/60">(speichere…)</span>}
          </div>
          <div className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen (Funktion, Kategorie, Beschreibung) …" className="input w-72" />
            <button onClick={() => setQ("")} className="btn">Zurücksetzen</button>
            <Link href="/roles" className="btn">Rollen verwalten</Link>
            <button onClick={onUndo} disabled={disabled || !undoStack.length} className={`btn ${disabled || !undoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}>Rückgängig</button>
            <button onClick={onRedo} disabled={disabled || !redoStack.length} className={`btn ${disabled || !redoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}>Wiederholen</button>
            <button onClick={() => onSaveDraft(false)} disabled={disabled || !hasPending || isSaving} className={`btn ${disabled || !hasPending || isSaving ? "opacity-50 cursor-not-allowed" : ""}`} title="Zwischenspeichern ohne Sperren">
              {hasPending ? `Zwischenspeichern (${pendingChanges.length})` : "Zwischenspeichern"}
            </button>
            <button disabled={disabled} onClick={onSubmit} className={`btn btn-primary ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
              Einreichen & Sperren
            </button>
          </div>
        </div>
        {(info || error) && (
          <div className="mt-2 text-sm">
            {info && <span className="text-green-700">{info}</span>}
            {error && <span className="text-red-700 ml-3">{error}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-3">
          <GroupSidebar permissions={filteredPermissions} selectedPath={selectedPath} onSelect={setSelectedPath} />
        </div>
        <div className="col-span-12 md:col-span-9">
          <FunctionMatrix
            roles={roles}
            permissions={filteredPermissions}
            assigned={assigned}
            onToggle={onToggle}
            disabled={disabled}
            rootPath={selectedPath}
          />
        </div>
      </div>

      {hasPending && !disabled && (
        <div className="fixed bottom-4 right-4">
          <div className="card px-3 py-2 text-sm flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-yellow-500" />
            <span>{pendingChanges.length} ungespeicherte Änderung(en)</span>
            <button onClick={() => onSaveDraft(false)} className="btn" disabled={isSaving}>{isSaving ? "…" : "Jetzt speichern"}</button>
            <button onClick={onUndo} className="btn" disabled={!undoStack.length}>Rückgängig</button>
          </div>
        </div>
      )}
    </div>
  );
}
