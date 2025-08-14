export default function LockBanner({ lockedAt }) {
  if (!lockedAt) return null;
  return (
    <div className="p-3 rounded-xl bg-yellow-50 border border-yellow-300 text-yellow-800 mb-4">
      Dieser Datensatz wurde am {new Date(lockedAt).toLocaleString()} eingereicht und ist schreibgeschützt.
    </div>
  );
}
