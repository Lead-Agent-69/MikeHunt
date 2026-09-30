// Per-route loading skeleton for the Map page
export default function MapLoading() {
  return (
    <div className="relative w-full h-[calc(100vh-4rem)] animate-pulse">
      <div className="absolute inset-0 rounded-2xl bg-[var(--s2)]" />
      <div className="absolute bottom-6 right-6 flex flex-col gap-2">
        <div className="h-8 w-8 rounded-lg bg-[var(--s3)]" />
        <div className="h-8 w-8 rounded-lg bg-[var(--s3)]" />
      </div>
      <div className="absolute top-6 left-6 w-64 space-y-2">
        <div className="h-10 w-full rounded-xl bg-[var(--s3)]" />
        <div className="h-8 w-3/4 rounded-lg bg-[var(--s3)]" />
      </div>
    </div>
  );
}
