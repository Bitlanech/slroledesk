import { useEffect, useState } from "react";
import RoleManager from "@/components/RoleManager";
import { withSsrSession } from "@/lib/auth";
import Link from "next/link";

export const getServerSideProps = withSsrSession(async ({ req }) => {
  if (!req.session?.customerId) return { redirect: { destination: "/", permanent: false } };
  return { props: {} };
});

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [lockedAt, setLockedAt] = useState(null);

  const load = async () => {
    const r = await fetch("/api/roles"); if (r.status === 401) { location.href = "/"; return; }
    const j = await r.json().catch(() => ({})); setRoles(j.roles || []);
    const m = await fetch("/api/permissions"); if (m.ok) { const mj = await m.json(); setLockedAt(mj.lockedAt || null); }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="card p-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Rollen verwalten</h1>
          <Link href="/assign" className="btn">← Zurück zu Zuweisungen</Link>
        </div>
      </div>
      <RoleManager roles={roles} onChanged={load} disabled={!!lockedAt} />
      {lockedAt && <div className="text-xs text-ink/60">Hinweis: Datensatz ist gesperrt – Änderungen sind nicht möglich.</div>}
    </div>
  );
}
