import { useState } from "react";

export default function AdminLogin() {
  const [err, setErr] = useState("");

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr("");
    const fd = new FormData(e.currentTarget);
    const token = fd.get("token");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    if (res.ok) location.href = "/admin";
    else {
      const j = await res.json().catch(() => ({}));
      setErr(j.error || "Login fehlgeschlagen.");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <form onSubmit={onSubmit} className="bg-white p-6 rounded-2xl shadow w-full max-w-md space-y-4">
        <h1 className="text-2xl font-semibold">Admin Login</h1>
        <input name="token" placeholder="ADMIN_TOKEN" className="w-full border rounded-lg p-3" required autoFocus />
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button className="w-full rounded-xl p-3 border hover:bg-gray-50">Anmelden</button>
      </form>
    </div>
  );
}
