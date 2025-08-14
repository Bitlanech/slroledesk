import { useEffect, useMemo, useState } from "react";
import { withSsrSession } from "@/lib/auth";
import Link from "next/link";

export const getServerSideProps = withSsrSession(async ({ req }) => {
  if (!req.session?.admin) return { redirect: { destination: "/admin/login", permanent: false } };
  return { props: {} };
});

function Field({ label, ...props }) {
  return (
    <label className="block">
      <span className="text-sm text-ink/70">{label}</span>
      <input {...props} className="input mt-1 w-full" />
    </label>
  );
}

export default function AdminHome() {
  const [customers, setCustomers] = useState([]);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const fetchData = async (query = "") => {
    setErr(""); setMsg("");
    const res = await fetch(`/api/admin/customers${query ? `?q=${encodeURIComponent(query)}` : ""}`);
    if (res.status === 401) { location.href = "/admin/login"; return; }
    const j = await res.json().catch(() => ({}));
    if (res.ok) setCustomers(j.customers || []);
    else setErr(j.error || "Laden fehlgeschlagen.");
  };

  useEffect(() => { fetchData(); }, []);

  const onSave = async (e) => {
    e.preventDefault();
    setErr(""); setMsg("");
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (!body.id) delete body.id;
    const res = await fetch("/api/admin/customers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg("Gespeichert."); setEdit(null); fetchData(q); }
    else setErr(j.error || "Speichern fehlgeschlagen.");
  };

  const onLockToggle = async (c) => {
    setErr(""); setMsg("");
    const res = await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: c.lockedAt ? "unlock" : "lock", customerId: c.id }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg(c.lockedAt ? "Entsperrt." : "Gesperrt."); fetchData(q); }
    else setErr(j.error || "Aktion fehlgeschlagen.");
  };

  const onNewCode = async (c) => {
    setErr(""); setMsg("");
    const res = await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "code:new", customerId: c.id, codeLength: 10 }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg(`Neuer Code: ${j.code?.code || ""}`); fetchData(q); }
    else setErr(j.error || "Code anlegen fehlgeschlagen.");
  };

  const onCodeSetActive = async (codeId, active) => {
    setErr(""); setMsg("");
    const res = await fetch("/api/admin/customers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "code:setActive", codeId, active }) });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg("Code aktualisiert."); fetchData(q); }
    else setErr(j.error || "Code-Aktion fehlgeschlagen.");
  };

  const onDeleteCustomer = async (id) => {
    if (!confirm("Kunde inklusive Rollen, Codes und Zuweisungen endgültig löschen?")) return;
    setErr(""); setMsg("");
    const res = await fetch("/api/admin/customers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customerId: id })
    });
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setMsg("Kunde gelöscht."); fetchData(q); }
    else setErr(j.error || "Löschen fehlgeschlagen.");
  };

  const filtered = useMemo(() => customers, [customers]);

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Admin – Kundenverwaltung</h1>
          <div className="flex gap-2">
            <Link href="/admin/import" className="btn">CSV-Import</Link>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Suchen…" className="input w-64" />
          <button onClick={() => fetchData(q)} className="btn">Suchen</button>
          <button onClick={() => { setQ(""); fetchData(""); }} className="btn">Zurücksetzen</button>
          <button onClick={() => setEdit({})} className="btn btn-primary">+ Neuer Kunde</button>
        </div>
      </div>

      {err && <div className="text-red-700">{err}</div>}
      {msg && <div className="text-green-700">{msg}</div>}

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th><th>Kontakt</th><th>Adresse</th><th>Codes</th><th>Status</th><th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} className="border-top border-edge align-top">
                <td className="p-3">
                  <div className="font-medium">{c.name}</div>
                  {c.company && <div className="text-xs text-ink/60">{c.company}</div>}
                </td>
                <td className="p-3">
                  <div>{c.contactName || "-"}</div>
                  <div className="text-xs text-ink/60">{c.email || ""}{c.phone ? (c.email ? " · " : "") + c.phone : ""}</div>
                </td>
                <td className="p-3">{[c.street, [c.zip, c.city].filter(Boolean).join(" "), c.country].filter(Boolean).join(", ") || "-"}</td>
                <td className="p-3">
                  <div className="space-y-1">
                    {c.accessCodes?.length
                      ? c.accessCodes.map(code => (
                          <div key={code.id} className="flex items-center gap-2">
                            <code className="px-1.5 py-0.5 border border-edge rounded bg-soft">{code.code}</code>
                            <span className={`text-xs ${code.active ? "text-green-700" : "text-ink/50"}`}>{code.active ? "aktiv" : "inaktiv"}</span>
                            <button onClick={() => onCodeSetActive(code.id, !code.active)} className="btn text-xs">{code.active ? "deaktivieren" : "aktivieren"}</button>
                          </div>
                        ))
                      : <div className="text-ink/50 text-sm">–</div>}
                    <button onClick={() => onNewCode(c)} className="btn text-xs">+ Code</button>
                  </div>
                </td>
                <td className="p-3">
                  {c.lockedAt
                    ? <span className="text-xs px-2 py-0.5 rounded border border-edge bg-soft">Gesperrt</span>
                    : <span className="text-xs px-2 py-0.5 rounded border border-edge bg-soft">Offen</span>}
                </td>
                <td className="p-3 space-x-2">
                  <button onClick={() => setEdit(c)} className="btn text-sm">Bearbeiten</button>
                  <button onClick={() => onLockToggle(c)} className="btn text-sm">{c.lockedAt ? "Entsperren" : "Sperren"}</button>
                  <button onClick={() => onDeleteCustomer(c.id)} className="btn text-sm">Löschen</button>
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={6} className="p-6 text-center text-ink/50">Keine Kunden gefunden.</td></tr>}
          </tbody>
        </table>
      </div>

      {edit && (
        <form onSubmit={onSave} className="card p-4 space-y-3">
          <h2 className="text-lg font-semibold">{edit.id ? "Kunde bearbeiten" : "Neuen Kunden anlegen"}</h2>
          {edit.id && <input type="hidden" name="id" defaultValue={edit.id} />}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Name*" name="name" defaultValue={edit.name || ""} required />
            <Field label="Login-Code (leer = auto)" name="code" defaultValue={edit.code || ""} />
            <Field label="Firma" name="company" defaultValue={edit.company || ""} />
            <Field label="Kontaktperson" name="contactName" defaultValue={edit.contactName || ""} />
            <Field label="E-Mail" name="email" defaultValue={edit.email || ""} />
            <Field label="Telefon" name="phone" defaultValue={edit.phone || ""} />
            <Field label="Strasse" name="street" defaultValue={edit.street || ""} />
            <Field label="PLZ" name="zip" defaultValue={edit.zip || ""} />
            <Field label="Ort" name="city" defaultValue={edit.city || ""} />
            <Field label="Land" name="country" defaultValue={edit.country || "CH"} />
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary">Speichern</button>
            <button type="button" onClick={() => setEdit(null)} className="btn">Abbrechen</button>
          </div>
        </form>
      )}
    </div>
  );
}
