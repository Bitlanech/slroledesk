import { useEffect, useState } from "react";
import AssignTable from "../components/AssignTable";
import LockBanner from "../components/LockBanner";

export default function ViewOnly() {
  const [data, setData] = useState(null);
  useEffect(() => { (async () => {
    const res = await fetch("/api/permissions");
    if (!res.ok) { window.location.href = "/"; return; }
    const j = await res.json(); setData(j);
  })(); }, []);
  if (!data) return <div className="p-6">Lade…</div>;

  return (
    <div className="min-h-screen p-6 bg-gray-50 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Rollen & Berechtigungen (Ansicht)</h1>
        <button onClick={async () => { await fetch("/api/logout"); location.href = "/"; }} className="border rounded-xl px-3 py-2">Logout</button>
      </div>
      <LockBanner lockedAt={data.lockedAt} />
      <AssignTable roles={data.roles} permissions={data.permissions} assigned={new Set(data.assigned)} onToggle={() => {}} disabled />
    </div>
  );
}
