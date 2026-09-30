// Per-route loading skeleton for the Deal detail page
export default function DealLoading() {
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6 animate-pulse">
      {/* Image gallery skeleton */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 h-72 rounded-2xl bg-[var(--s2)]" />
        <div className="space-y-3">
          <div className="h-[138px] rounded-2xl bg-[var(--s2)]" />
          <div className="h-[138px] rounded-2xl bg-[var(--s2)]" />
        </div>
      </div>
      {/* Title + price */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <div className="h-7 w-64 rounded-lg bg-[var(--s2)]" />
          <div className="h-4 w-40 rounded bg-[var(--s2)]" />
        </div>
        <div className="h-10 w-32 rounded-xl bg-[var(--s2)]" />
      </div>
      {/* Verdict card */}
      <div className="h-36 rounded-2xl bg-[var(--s2)]" />
      {/* Details grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-[var(--s2)]" />
        ))}
      </div>
    </div>
  );
}
