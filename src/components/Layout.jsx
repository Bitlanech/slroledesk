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
          <Link href="/assign" className="flex items-center gap-3">
            <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
            <span>Berechtigungen zuweisen</span>
          </Link>
          <Link href="/roles" className="flex items-center gap-3">
            <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <span>Rollen verwalten</span>
          </Link>
          <Link href="/view" className="flex items-center gap-3">
            <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <span>Nur Ansicht</span>
          </Link>

          {/* Admin-Links nur für Admins anzeigen */}
          {isAdmin && (
            <>
              <div className="text-xs font-semibold text-ink/50 uppercase tracking-wider px-2 mt-4 mb-2">Administration</div>
              <Link href="/admin" className="flex items-center gap-3">
                <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <span>Kunden verwalten</span>
              </Link>
              <Link href="/admin/import" className="flex items-center gap-3">
                <svg className="w-5 h-5 text-ink/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Berechtigungen importieren</span>
              </Link>
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
