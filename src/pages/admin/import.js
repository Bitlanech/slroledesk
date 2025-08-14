import { useState } from "react";
import { withSsrSession } from "@/lib/auth";

export const getServerSideProps = withSsrSession(async ({ req }) => {
  if (!req.session?.admin) {
    return { redirect: { destination: "/admin/login", permanent: false } };
  }
  return { props: {} };
});

export default function Import() {
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const onUpload = async (e) => {
    e.preventDefault();
    setMsg(""); setErr("");
    const fd = new FormData(e.currentTarget);
    // kein adminToken-Feld nötig – wir sind eingeloggt
    const res = await fetch("/api/permissions", { method: "POST", body: fd });
    const j = await res.json().catch(() => ({}));
    if (res.ok) setMsg(j.message || "Import erfolgreich.");
    else setErr(j.error || "Import fehlgeschlagen.");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">CSV-Import – Globale Berechtigungen</h1>

      <div className="card p-4 space-y-3">
        <p className="text-sm text-ink/70">
          Importiert die Masterliste aller Berechtigungen (Upsert pro Key). Kunden-/Rollen-Zuordnungen werden nicht verändert.
        </p>
        <div className="rounded-lg border border-edge bg-soft p-3 text-sm">
          <div className="font-medium mb-1">Erwartetes Format (Semikolon):</div>
          <pre className="overflow-x-auto text-xs leading-5">
{`Gruppe;SubGruppe1;SubGruppe2;SubGruppe3;SubGruppe4;SubGruppe5;Berechtigungsname;Erlaubt;Lesen;Bearbeiten;Hinzufügen;Kopieren;Löschen;Drucken;Weitere
Funktion;Auftrag;Belege;Ausgangsbelege;Auftrag;;;true;true;true;true;true;true;BelegeArchivieren,BelegstatusSetzen`}
          </pre>
        </div>

        <form onSubmit={onUpload} className="flex flex-col md:flex-row gap-3 items-start">
          <input type="file" name="file" accept=".csv,text/csv" className="input" required />
          <button className="btn btn-primary">Importieren</button>
          {msg && <span className="text-green-700 text-sm">{msg}</span>}
          {err && <span className="text-red-700 text-sm">{err}</span>}
        </form>
      </div>
    </div>
  );
}
