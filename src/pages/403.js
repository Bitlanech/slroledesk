export default function Forbidden() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 mb-4">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
            <path d="M12 2a10 10 0 1 1-7.071 2.929A9.966 9.966 0 0 1 12 2Zm1 13v2h-2v-2h2Zm0-8v6h-2V7h2Z"/>
          </svg>
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">403 – Zugriff verweigert</h1>
        <p className="mt-2 text-gray-600">
          Du hast keine Berechtigung, diese Seite aufzurufen.
        </p>
        <a href="/" className="mt-6 inline-block rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
          Zur Startseite
        </a>
      </div>
    </main>
  );
}
