// A VIN-based CarFax link. We do NOT scrape/store CarFax reports (they're paid), so we never claim to
// "have" one — instead, when a car has a VIN we give the buyer a one-tap way to pull the history on
// CarFax themselves. Honest: it's a lookup, not a fabricated report. Renders nothing without a valid VIN.

export function CarfaxLink({
  vin,
  className,
  label = "Run CarFax",
}: {
  vin?: string | null;
  className?: string;
  label?: string;
}) {
  const v = (vin || "").trim().toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{11,17}$/.test(v)) return null; // valid-ish VIN only (no I/O/Q)
  return (
    <a
      href={`https://www.carfax.com/vehicle/${encodeURIComponent(v)}`}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={
        className ??
        "inline-flex items-center gap-1 text-xs font-bold text-[var(--amber-d)] hover:underline"
      }
      title={`Pull the CarFax history for VIN ${v}`}
    >
      🔎 {label} ↗
    </a>
  );
}
