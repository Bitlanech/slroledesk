import { useState } from "react";
import { useRouter } from "next/router";
import { getIronSession } from "iron-session";
import { sessionOptions } from "@/lib/session";

/**
 * Login-Page: Server entscheidet, ob schon eingeloggt.
 * Wenn eingeloggt -> sofortige SSR-Weiterleitung (kein Hydration-Switch).
 */

export default function Login() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || "Login fehlgeschlagen");
      }
      // nach erfolgreichem Login: Ziel anhand Rolle ermitteln
      const who = await fetch("/api/whoami").then((r) => r.json()).catch(() => ({}));
      if (who?.isAdmin) router.replace("/admin");
      else router.replace("/assign");
    } catch (e) {
      setErr(e.message || "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-2xl shadow w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold text-gray-900">SL-RoleDesk</h1>
          <p className="text-sm text-gray-600 mt-1">Mit Ihrem Code einloggen</p>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-gray-700">Code</span>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
            className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="z. B. ACME-1234"
          />
        </label>

        {err && <div className="text-sm text-red-600">{err}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-blue-600 text-white py-2.5 disabled:opacity-50"
        >
          {loading ? "Anmelden…" : "Anmelden"}
        </button>

        <p className="text-xs text-gray-500 text-center">
          Probleme beim Einloggen? Kontaktieren Sie Ihren Administrator.
        </p>
      </form>
    </main>
  );
}

export async function getServerSideProps({ req, res }) {
  const session = await getIronSession(req, res, sessionOptions);
  // Bereits eingeloggt? Direkt weiter – so bleibt SSR/Client-Markup identisch.
  if (session?.admin) {
    return { redirect: { destination: "/admin", permanent: false } };
  }
  if (session?.customerId) {
    return { redirect: { destination: "/assign", permanent: false } };
  }
  return { props: {} };
}
// ⬅️ wichtig: sorgt dafür, dass _app.js kein Layout/Sidebar einbindet
Login.noLayout = true;