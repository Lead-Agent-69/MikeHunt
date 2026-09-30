// Per-route loading skeleton for the Discover page
export default function DiscoverLoading() {
  return (
    <div className="p-6 space-y-8 animate-pulse">
      {/* Hero section */}
      <div className="h-48 rounded-3xl bg-[var(--s2)]" />
      {/* Category pills */}
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 w-20 flex-shrink-0 rounded-full bg-[var(--s2)]" />
        ))}
      </div>
      {/* Deal cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl overflow-hidden" style={{ background: "var(--s2)" }}>
            <div className="h-44 bg-[var(--s3)]" />
            <div className="p-4 space-y-3">
              <div className="h-4 w-3/4 rounded bg-[var(--s3)]" />
              <div className="h-3 w-1/2 rounded bg-[var(--s3)]" />
              <div className="flex justify-between">
                <div className="h-6 w-16 rounded-lg bg-[var(--s3)]" />
                <div className="h-6 w-20 rounded-lg bg-[var(--s3)]" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
