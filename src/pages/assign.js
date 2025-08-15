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
  const [isCompact, setIsCompact] = useState(false);

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

  // Scroll detection for compact mode with debouncing
  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrolled = window.scrollY > 200;
          setIsCompact((prev) => {
            // Only update if the state actually changes
            if (prev !== scrolled) {
              return scrolled;
            }
            return prev;
          });
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

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
    // Bestätigungsdialog anzeigen
    const confirmed = window.confirm(
      "⚠️ ACHTUNG: Diese Aktion ist nicht umkehrbar!\n\n" +
      "Durch das Einreichen & Sperren werden alle Änderungen final gespeichert und die Daten werden gesperrt.\n" +
      "Sie können danach keine weiteren Änderungen mehr vornehmen.\n\n" +
      "Möchten Sie wirklich fortfahren?"
    );
    
    if (!confirmed) {
      return;
    }

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

      <div className={`card sticky top-14 z-20 bg-white transition-all duration-300 ${isCompact ? 'p-3 shadow-lg' : 'p-6'}`}>
        {isCompact ? (
          // Compact Mode
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              <h1 className="text-lg font-semibold whitespace-nowrap">Rollen & Berechtigungen</h1>
              <input 
                value={q} 
                onChange={(e) => setQ(e.target.value)} 
                placeholder="Suchen..." 
                className="input flex-1 max-w-sm h-8 text-sm" 
              />
              <div className="flex items-center gap-2 text-xs text-ink/50">
                <span>v{assignVersion}</span>
                {isSaving && <span className="text-blue-600">Speichere...</span>}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button 
                onClick={() => setQ("")} 
                className="btn p-2" 
                title="Suche zurücksetzen"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <Link href="/roles" className="btn p-2" title="Rollen verwalten">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </Link>
              <div className="w-px h-6 bg-edge/30" />
              <button 
                onClick={onUndo} 
                disabled={disabled || !undoStack.length} 
                className={`btn p-2 ${disabled || !undoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}
                title="Rückgängig"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </button>
              <button 
                onClick={onRedo} 
                disabled={disabled || !redoStack.length} 
                className={`btn p-2 ${disabled || !redoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}
                title="Wiederholen"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                </svg>
              </button>
              <div className="w-px h-6 bg-edge/30" />
              <button 
                onClick={() => onSaveDraft(false)} 
                disabled={disabled || !hasPending || isSaving} 
                className={`btn p-2 ${disabled || !hasPending || isSaving ? "opacity-50 cursor-not-allowed" : ""} ${hasPending ? 'bg-yellow-50 border-yellow-400' : ''}`} 
                title={hasPending ? `Zwischenspeichern (${pendingChanges.length} Änderungen)` : "Zwischenspeichern"}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V2" />
                </svg>
                {hasPending && <span className="ml-1 text-xs font-bold">{pendingChanges.length}</span>}
              </button>
              <button 
                disabled={disabled} 
                onClick={onSubmit} 
                className={`btn btn-primary p-2 ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                title="Einreichen & Sperren"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </button>
              <ExportPdfButtons mode="customer" compact={true} />
            </div>
          </div>
        ) : (
          // Normal Mode
          <div className="space-y-4">
            {/* Header Section */}
            <div className="flex items-center justify-between border-b border-edge/20 pb-4">
              <div className="space-y-1">
                <h1 className="text-xl font-semibold">Rollen & Berechtigungen</h1>
                <div className="flex items-center gap-4 text-sm text-ink/60">
                  <span>Zuletzt zwischengespeichert: {draftLabel}</span>
                  <span>•</span>
                  <span>Version: {assignVersion}</span>
                  {isSaving && (
                    <>
                      <span>•</span>
                      <span className="text-blue-600">Speichere...</span>
                    </>
                  )}
                </div>
              </div>
              <ExportPdfButtons mode="customer" />
            </div>

            {/* Search and Actions Section */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <input 
                  value={q} 
                  onChange={(e) => setQ(e.target.value)} 
                  placeholder="Suchen (Funktion, Kategorie, Beschreibung) …" 
                  className="input w-full max-w-md" 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={() => setQ("")} className="btn">
                  <span className="mr-1">⟲</span> Zurücksetzen
                </button>
                <div className="w-px h-6 bg-edge/30" />
                <Link href="/roles" className="btn">
                  <span className="mr-1">⚙</span> Rollen verwalten
                </Link>
                <div className="w-px h-6 bg-edge/30" />
                <button 
                  onClick={onUndo} 
                  disabled={disabled || !undoStack.length} 
                  className={`btn ${disabled || !undoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="mr-1">↶</span> Rückgängig
                </button>
                <button 
                  onClick={onRedo} 
                  disabled={disabled || !redoStack.length} 
                  className={`btn ${disabled || !redoStack.length ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="mr-1">↷</span> Wiederholen
                </button>
                <div className="w-px h-6 bg-edge/30" />
                <button 
                  onClick={() => onSaveDraft(false)} 
                  disabled={disabled || !hasPending || isSaving} 
                  className={`btn ${disabled || !hasPending || isSaving ? "opacity-50 cursor-not-allowed" : ""}`} 
                  title="Zwischenspeichern ohne Sperren"
                >
                  <span className="mr-1">💾</span>
                  {hasPending ? `Zwischenspeichern (${pendingChanges.length})` : "Zwischenspeichern"}
                </button>
                <button 
                  disabled={disabled} 
                  onClick={onSubmit} 
                  className={`btn btn-primary ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <span className="mr-1">🔒</span> Einreichen & Sperren
                </button>
              </div>
            </div>
          </div>
        )}
        {(info || error) && (
          <div className="mt-2 text-sm">
            {info && <span className="text-green-700">{info}</span>}
            {error && <span className="text-red-700 ml-3">{error}</span>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 mt-4">
        <div className="col-span-12 md:col-span-3">
          <div className={`sticky ${isCompact ? 'top-32' : 'top-80'} transition-all duration-300`}>
            <GroupSidebar 
              permissions={filteredPermissions} 
              selectedPath={selectedPath} 
              onSelect={setSelectedPath} 
              roles={roles} 
              assigned={assigned}
              onToggle={onToggle}
              disabled={disabled}
            />
          </div>
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
