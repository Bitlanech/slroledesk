export default function CustomerCard({ customer }) {
  if (!customer) return null;
  const f = (v) => v && String(v).trim().length ? v : null;

  return (
    <div className="border rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{customer.name || "Kunde"}</h2>
          <div className="text-sm text-gray-700 space-y-0.5 mt-1">
            {f(customer.company) && <div><span className="font-medium">Firma:</span> {customer.company}</div>}
            {f(customer.contactName) && <div><span className="font-medium">Kontakt:</span> {customer.contactName}</div>}
            {f(customer.email) && <div><span className="font-medium">E-Mail:</span> {customer.email}</div>}
            {f(customer.phone) && <div><span className="font-medium">Telefon:</span> {customer.phone}</div>}
            {(f(customer.street) || f(customer.zip) || f(customer.city) || f(customer.country)) && (
              <div>
                <span className="font-medium">Adresse:</span>{" "}
                {[f(customer.street), [f(customer.zip), f(customer.city)].filter(Boolean).join(" "), f(customer.country)]
                  .filter(Boolean)
                  .join(", ")}
              </div>
            )}
          </div>
        </div>
        {customer.lockedAt && (
          <div className="text-xs text-yellow-800 bg-yellow-50 border border-yellow-300 rounded-lg px-3 py-1">
            Eingereicht am {new Date(customer.lockedAt).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}
