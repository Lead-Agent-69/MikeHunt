// Per-route loading skeleton for the Find/Discover page
export default function FindLoading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      {/* Filter bar skeleton */}
      <div className="flex gap-3 flex-wrap">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-24 rounded-xl bg-[var(--s2)]" />
        ))}
      </div>
      {/* Results skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 rounded-2xl p-4" style={{ background: "var(--s2)" }}>
            <div className="h-24 w-32 flex-shrink-0 rounded-xl bg-[var(--s3)]" />
            <div className="flex-1 space-y-3 py-1">
              <div className="h-4 w-2/3 rounded bg-[var(--s3)]" />
              <div className="h-3 w-1/3 rounded bg-[var(--s3)]" />
              <div className="flex gap-2">
                <div className="h-6 w-16 rounded-lg bg-[var(--s3)]" />
                <div className="h-6 w-20 rounded-lg bg-[var(--s3)]" />
              </div>
            </div>
            <div className="w-20 flex flex-col gap-2 items-end">
              <div className="h-6 w-full rounded bg-[var(--s3)]" />
              <div className="h-4 w-3/4 rounded bg-[var(--s3)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
