import { useEffect, useState } from "react";

/**
 * Einfache PDF-Export-Schaltfläche.
 * - mode="customer": exportiert PDF für den eingeloggten Kunden (/api/export/pdf?type=customer)
 * - mode="admin":    exportiert PDF für einen spezifischen KundenId (nur Admins)
 *
 * Props (optional):
 *   - mode: "customer" | "admin"
 *   - customerId?: string   (nur für mode="admin")
 *   - className?: string    (zusätzliche Styles)
 *   - label?: string        (angezeigter Text)
 */
export default function ExportPdfButtons({ mode = "customer", customerId, className = "", label = "Als PDF exportieren" }) {
  const [who, setWho] = useState({ isAdmin: false, isCustomer: false });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/whoami");
        const data = await res.json();
        if (!alive) return;
        setWho({ isAdmin: !!data.isAdmin, isCustomer: !!data.isCustomer });
      } catch {
        if (!alive) return;
        setWho({ isAdmin: false, isCustomer: false });
      }
    })();
    return () => { alive = false; };
  }, []);

  // Sichtbarkeit schützen (kein Rendern, wenn keine Berechtigung)
  if (mode === "admin" && !who.isAdmin) return null;
  if (mode === "customer" && !who.isCustomer) return null;

  const href =
    mode === "admin"
      ? `/api/export/pdf?type=admin&customerId=${encodeURIComponent(customerId || "")}`
      : `/api/export/pdf?type=customer`;

  return (
    <a
      href={href}
      className={`inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 ${className}`}
      title="PDF-Export herunterladen"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden="true">
        <path d="M6 2h8l6 6v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v2H8v-2Zm0 4h8v2H8v-2Z"/>
      </svg>
      <span>{label}</span>
    </a>
  );
}
