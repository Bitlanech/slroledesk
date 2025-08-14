import Link from "next/link";
import { useEffect, useState } from "react";

/**
 * Navigation blendet Admin-Menü dynamisch aus.
 * Zieht isAdmin via /api/whoami (damit clientseitig konsistent).
 */
export default function TopNav() {
  const [who, setWho] = useState({ loading: true, isAdmin: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/whoami");
        const data = await res.json();
        if (!alive) return;
        setWho({ loading: false, isAdmin: !!data?.isAdmin });
      } catch {
        if (!alive) return;
        setWho({ loading: false, isAdmin: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200">
      <nav className="mx-auto max-w-7xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="font-semibold text-gray-900">SL-RoleDesk</Link>
          <Link href="/assign" className="text-sm text-gray-700 hover:text-gray-900">Rollen & Berechtigungen</Link>
          {who.isAdmin && (
            <div className="flex items-center gap-3">
              <Link href="/admin" className="text-sm text-gray-700 hover:text-gray-900">Admin</Link>
              <Link href="/admin/customers" className="text-sm text-gray-700 hover:text-gray-900">Kunden</Link>
              <Link href="/admin/upload" className="text-sm text-gray-700 hover:text-gray-900">CSV-Import</Link>
            </div>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {who.isAdmin ? "Admin" : "Kunde"}
        </div>
      </nav>
    </header>
  );
}
