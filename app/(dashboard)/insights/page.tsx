"use client";
import React from "react";
import { ErrorState, LoadingState } from "@/components/shared/PageStates";
import { ownerOutcomeFetcher as fetcher } from "@/lib/outcomes/fetcher";
import useSWR, { mutate } from "swr";
import Link from "next/link";
import { useDealerId } from "@/hooks/useDealerId";
import { OutcomeEditor } from "@/components/outcomes/OutcomeEditor";
import {
  completeOutcomeRows,
  ledgerTotals,
  type LedgerRow,
} from "@/lib/outcomes/ledger";
import { SourceROI } from "@/components/insights/SourceROI";
import { MarketPulse } from "@/components/insights/MarketPulse";
const money = (v: number | string | null | undefined) =>
  v == null
    ? "Not recorded"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(Number(v));

export default function InsightsPage() {
  const { dealerId, loading } = useDealerId();
  const {
    data,
    error,
    isLoading,
    mutate: mutateOut,
  } = useSWR(
    dealerId && !loading ? ["/api/outcomes", dealerId] : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: calData } = useSWR(
    dealerId && !loading ? ["/api/calibration", dealerId] : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const [editing, setEditing] = React.useState<LedgerRow | null | undefined>(
    undefined,
  );
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    setEditing(undefined);
    setMessage("");
  }, [dealerId]);
  const outcomes: LedgerRow[] = data?.outcomes ?? [];
  const complete = completeOutcomeRows(outcomes);
  const cal = calData?.calibration;
  if (loading)
    return <LoadingState label="Checking your account..." variant="block" />;
  if (!dealerId)
    return (
      <Link
        href="/login?next=%2Finsights"
        className="inline-flex min-h-11 items-center text-[var(--blue)]"
      >
        Sign in to view your outcomes
      </Link>
    );
  return (
    <div className="mx-auto min-w-0 max-w-5xl space-y-5 pb-24">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">Outcomes and learning</h1>
          <p className="mt-1 text-sm text-[var(--t3)]">
            Your reported purchases, sales and actual costs. Complete cost
            records support personal learning; they are not independent market
            verification.
          </p>
        </div>
        <button
          type="button"
          disabled={isLoading || !!error}
          onClick={() => setEditing(null)}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] disabled:opacity-50"
        >
          Record a purchase or sale
        </button>
      </header>
      {error ? (
        <div role="alert">
          <ErrorState
            title="Outcome history unavailable"
            message={error.message}
            onRetry={() => mutateOut()}
          />
        </div>
      ) : isLoading ? (
        <LoadingState label="Loading your outcome history..." variant="block" />
      ) : (
        <>
          <section
            aria-label="Outcome evidence"
            className="rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4 sm:p-5"
          >
            <h2 className="font-bold">What can support learning</h2>
            <p className="mt-2 text-sm text-[var(--t3)]">
              {complete.length} complete sale{" "}
              {complete.length === 1 ? "record" : "records"} in the latest{" "}
              {outcomes.length} records. Costs, dates and sale amounts must be
              confirmed before net results count.
            </p>
            {cal ? (
              <>
                <p className="mt-3 text-sm">{cal.message}</p>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {[
                    [
                      "Resale matched pairs",
                      String(cal.matchedSamples?.sell ?? 0),
                    ],
                    [
                      "Transport matched pairs",
                      String(cal.matchedSamples?.transport ?? 0),
                    ],
                    [
                      "Repair matched pairs",
                      String(cal.matchedSamples?.recon ?? 0),
                    ],
                    [
                      "Profit matched pairs",
                      String(cal.matchedSamples?.profit ?? 0),
                    ],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-[var(--t3)]">{label}</dt>
                      <dd className="mt-1 font-mono text-xl font-bold">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm text-[var(--t3)]">
                  {cal.profitAccuracyPct != null
                    ? `Historical profit agreement: ${cal.profitAccuracyPct}%.`
                    : "Profit agreement is unavailable until 5 matched profit predictions exist."}{" "}
                  These comparisons describe recorded history, not future
                  returns.
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--t3)]">
                Each model adjustment needs at least 5 complete sales with
                matched, dated predictions. Recording an already completed sale
                adds useful history without reconstructing a forecast after the
                fact.
              </p>
            )}
          </section>
          {editing !== undefined && (
            <OutcomeEditor
              key={`${dealerId}:${editing?.id ?? "new"}:${editing?.revision ?? 0}`}
              ownerId={dealerId}
              record={editing ?? undefined}
              onCancel={() => setEditing(undefined)}
              onReload={async () => {
                const refreshed = await mutateOut();
                setEditing(
                  refreshed?.outcomes?.find(
                    (row: LedgerRow) => row.id === editing?.id,
                  ),
                );
              }}
              onSaved={async (saved) => {
                setEditing(undefined);
                setMessage(
                  ledgerTotals(saved).complete
                    ? "Sale saved with confirmed actual costs."
                    : "Record saved. Update the sale or remaining costs when ready.",
                );
                await mutateOut();
                mutate(["/api/calibration", dealerId]);
                mutate(["/api/insights/source-roi", dealerId]);
              }}
            />
          )}
          {message && (
            <p role="status" className="text-sm text-[var(--t3)]">
              {message}
            </p>
          )}
          <SourceROI />
          <section aria-label="Your outcome records" className="space-y-3">
            <h2 className="font-bold">Latest records</h2>
            {!outcomes.length ? (
              <p className="rounded-lg border border-[var(--b2)] p-5 text-sm text-[var(--t3)]">
                No purchases or sales recorded yet.
              </p>
            ) : (
              outcomes.map((row) => {
                const totals = ledgerTotals(row);
                return (
                  <article
                    key={row.id}
                    className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4"
                  >
                    <div className="min-w-0">
                      <h3 className="break-words font-semibold">
                        {[row.year, row.make, row.model]
                          .filter(Boolean)
                          .join(" ") || "Vehicle"}
                      </h3>
                      <p className="mt-1 text-sm text-[var(--t3)]">
                        Purchase {money(row.purchase_price)}
                        {row.sell_price != null
                          ? ` · Sale ${money(row.sell_price)}`
                          : " · Unsold"}
                      </p>
                      <p className="mt-1 text-xs text-[var(--t3)]">
                        {totals.complete
                          ? "Complete owner-reported cost record"
                          : row.sell_price != null
                            ? "Sale reported · dates or costs need review"
                            : "Purchase recorded · sale not reported"}
                      </p>
                      {totals.profit != null && (
                        <p
                          className={`mt-2 font-mono font-bold ${totals.profit < 0 ? "text-[var(--red)]" : "text-[var(--t1)]"}`}
                        >
                          Net {money(totals.profit)} · All-in{" "}
                          {money(totals.totalCost)}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="min-h-11 rounded-lg border border-[var(--b2)] px-3 text-sm font-semibold"
                      onClick={() => setEditing(row)}
                    >
                      Edit actual record
                    </button>
                  </article>
                );
              })
            )}
            <p className="text-xs text-[var(--t3)]">
              Showing up to 200 most recently updated records. Historic entries
              remain available for review; incomplete cost records do not
              contribute net profit to learning.
            </p>
          </section>
        </>
      )}
      <MarketPulse />
    </div>
  );
}
