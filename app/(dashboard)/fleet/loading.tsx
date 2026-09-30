// Per-route loading skeleton for the Fleet/Inventory page
export default function FleetLoading() {
  return (
    <div className="p-6 space-y-4 animate-pulse">
      <div className="h-8 w-48 rounded-lg bg-[var(--s2)]" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "var(--s2)" }}>
            <div className="h-40 w-full bg-[var(--s3)]" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-[var(--s3)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--s3)]" />
              <div className="h-6 w-24 rounded-lg bg-[var(--s3)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
