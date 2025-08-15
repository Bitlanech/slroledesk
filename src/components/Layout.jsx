import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * Layout blendet Admin-Links nur für Admin-Sessions ein.
 * - Default (SSR/Initial): KEINE Admin-Links -> Kunden sehen sie nie.
 * - Nach Mount: /api/whoami abfragen und Admin-Links ggf. einblenden.
 *   (Admins sehen Links nach Hydration; Kunden nie.)
 *
 * Sicherheitshinweis:
 *  - Admin-Seiten/-APIs müssen dennoch serverseitig/route-seitig geschützt sein.
 *    (z. B. requireAdminPage / withAdminApi)
 */
export default function Layout({ children }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/whoami");
        if (!res.ok) return;
        const data = await res.json();
        if (!alive) return;
        setIsAdmin(!!data?.isAdmin);
      } catch {
        /* noop: bleibt false */
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="container-app">
      <aside className="sidebar">
        <div className="p-4 border-b border-edge/10 flex justify-center">
          <Image 
            src="/Logo_final.svg" 
            alt="SL-RoleDesk Logo" 
            width={180} 
            height={60}
            className="w-1/2 h-auto"
            priority
          />
        </div>

        <nav className="mt-4 px-4 space-y-1">
          <div className="text-xs font-semibold text-ink/50 uppercase tracking-wider px-2 mt-2 mb-2">Verwaltung</div>
          <Link href="/assign">Berechtigungen zuweisen</Link>
          <Link href="/roles">Rollen verwalten</Link>
          <Link href="/view">Nur Ansicht</Link>

          {/* Admin-Links nur für Admins anzeigen */}
          {isAdmin && (
            <>
              <div className="text-xs font-semibold text-ink/50 uppercase tracking-wider px-2 mt-4 mb-2">Administration</div>
              <Link href="/admin">Kunden verwalten</Link>
              <Link href="/admin/import">Berechtigungen importieren</Link>
            </>
          )}
        </nav>

        <div className="mt-auto p-4 text-xs text-ink/50">© BitLane</div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div className="topbar-inner">
            <div className="font-semibold">SL-RoleDesk</div>
            <div className="flex items-center gap-2">
              <a href="/view" className="btn">Nur anzeigen</a>
              <button
                onClick={async () => {
                  try { await fetch("/api/logout"); } finally { location.href = "/"; }
                }}
                className="btn"
              >
                Logout
              </button>
            </div>
          </div>
        </div>

        <main className="p-5">{children}</main>
      </div>
    </div>
  );
}
