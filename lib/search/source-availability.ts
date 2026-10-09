export type SourceAvailability = { id: string; readiness: string };

export function sourceAvailabilityNotice({
  sources,
  error,
  loading,
  configured,
}: {
  sources?: SourceAvailability[];
  error?: boolean;
  loading?: boolean;
  configured?: boolean;
}): { title: string; detail: string; retry: boolean } | null {
  if (error || configured === false)
    return {
      title: "Source coverage unavailable",
      detail:
        "Source availability and freshness could not be verified. Saved results may be incomplete; this is not proof that no cars match.",
      retry: true,
    };
  if (loading && !sources?.length)
    return {
      title: "Checking source coverage...",
      detail:
        "Search results are from indexed inventory. Current source availability is not yet confirmed.",
      retry: false,
    };
  if (!sources?.length)
    return {
      title: "Source coverage unknown",
      detail:
        "No source coverage evidence is available for this search. Results are not a complete view of the market.",
      retry: true,
    };
  const unique = Array.from(
    new Map(sources.map((source) => [source.id, source])).values(),
  );
  const pending = unique.filter(
    (source) => source.readiness === "needs_run",
  ).length;
  const empty = unique.filter(
    (source) => source.readiness === "no_rows",
  ).length;
  const unavailable = unique.filter(
    (source) => !["ready", "needs_run", "no_rows"].includes(source.readiness),
  ).length;
  if (!pending && !empty && !unavailable) return null;
  return {
    title: "Partial source coverage",
    detail: `${unavailable} sources unavailable, ${pending} awaiting refresh, ${empty} without indexed rows. Missing inventory is not proof that no cars are for sale.`,
    retry: true,
  };
}
