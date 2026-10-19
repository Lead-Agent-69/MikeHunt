"use client";

import React from "react";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { marketValuation } from "@/lib/market/valuation";
import {
  calculateFlipScenario,
  emptyScenario,
  readScenarioDraft,
  SCENARIO_FIELDS,
  scenarioFields,
  type ScenarioDraft,
  type ScenarioField,
} from "@/lib/scoring/flip-scenario";

interface MaxBidWidgetProps {
  dealId: string;
  ownerId: string | null;
  sellEstimate?: number | null;
  valuation?: unknown;
  source?: string | null;
  sourceUrl?: string | null;
  lastSeenAt?: string | null;
  askPrice?: number | null;
  buyNowPrice?: number | null;
  priceEvidence?: PriceEvidence;
  defaultTargetProfit?: number | null;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
const groups: { title: string; fields: ScenarioField[] }[] = [
  {
    title: "Purchase and resale",
    fields: ["purchase", "resale", "targetProfit"],
  },
  {
    title: "Acquisition and preparation",
    fields: ["buyerFees", "buyerFeeRate", "taxTitle", "repair", "transport"],
  },
  {
    title: "Holding, selling and reserve",
    fields: ["holding", "sellingFees", "sellingFeeRate", "otherCosts"],
  },
];

export function MaxBidWidget(props: MaxBidWidgetProps) {
  const storageKey = props.ownerId
    ? `mikehunt:flip-scenario:v1:${props.ownerId}:${props.dealId}`
    : null;
  const initialTarget = React.useRef(props.defaultTargetProfit);
  const [draft, setDraft] = React.useState<ScenarioDraft>(() =>
    emptyScenario(initialTarget.current),
  );
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);
  const [storageError, setStorageError] = React.useState("");
  const resultRef = React.useRef<HTMLDivElement>(null);
  const id = React.useId();
  React.useEffect(() => {
    setStorageError("");
    let saved: ReturnType<typeof readScenarioDraft> = null;
    try {
      saved = readScenarioDraft(
        storageKey ? localStorage.getItem(storageKey) : null,
      );
    } catch {
      setStorageError(
        "Saved drafts are unavailable in this browser. You can still calculate here.",
      );
    }
    setDraft(saved?.draft ?? emptyScenario(initialTarget.current));
    setSavedAt(saved?.savedAt ?? null);
    setDirty(false);
  }, [storageKey]);
  const result = calculateFlipScenario(draft);
  const m = result.metrics;
  const price = sourcePriceContext({
    source: props.source,
    source_url: props.sourceUrl,
    ask_price: props.priceEvidence?.listedAmount ?? props.askPrice,
    buy_now_price: props.buyNowPrice,
    price_evidence: props.priceEvidence,
    last_seen_at: props.lastSeenAt,
  });
  const valuation = marketValuation(props.valuation, props.sellEstimate);
  const canCopyPrice = price.comparisonEligible && price.cashPrice != null;
  const setField = (field: ScenarioField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setDirty(true);
  };
  const save = () => {
    if (!storageKey) return;
    try {
      const stamp = new Date().toISOString();
      localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, savedAt: stamp, draft }),
      );
      setSavedAt(stamp);
      setDirty(false);
      setStorageError("");
    } catch {
      setStorageError(
        "This browser could not save the draft. Your entries are still here; keep this panel open.",
      );
    }
  };
  const clear = () => {
    try {
      if (storageKey) localStorage.removeItem(storageKey);
      setStorageError("");
    } catch {
      setStorageError(
        "The saved draft could not be removed from this browser.",
      );
    }
    setDraft(emptyScenario(initialTarget.current));
    setSavedAt(null);
    setDirty(false);
  };
  const missing = scenarioFields.filter(
    (field) => result.missing.includes(field) || result.errors[field],
  );
  return (
    <section
      aria-labelledby={`${id}-heading`}
      data-testid="flip-scenario"
      className="min-w-0 rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4 sm:p-5"
    >
      <h3 id={`${id}-heading`} className="text-lg font-bold text-[var(--t1)]">
        Flip scenario planner
      </h3>
      <p className="mt-1 text-sm text-[var(--t3)]">
        See what is left after the full cost of a flip. These are your
        assumptions, before income tax; completing this plan does not verify a
        listing or recommend a purchase.
      </p>
      <div
        className="mt-4 grid gap-3 rounded-lg bg-[var(--s1)] p-3 sm:grid-cols-2"
        aria-label="Available evidence"
      >
        <div>
          <p className="text-xs font-semibold text-[var(--t3)]">
            {price.label}
          </p>
          <p className="mt-1 font-semibold">
            {price.amount != null ? money(price.amount) : "Price not reported"}
          </p>
          {canCopyPrice ? (
            <button
              type="button"
              className="mt-1 min-h-11 text-left text-sm font-semibold text-[var(--blue)] underline underline-offset-4"
              onClick={() => setField("purchase", String(price.cashPrice))}
            >
              Use{" "}
              {price.kind === "current_bid"
                ? `buy-now amount (${money(price.cashPrice!)})`
                : price.label.toLowerCase()}
            </button>
          ) : (
            <p className="mt-2 text-xs text-[var(--t3)]">
              Confirm the full purchase price at the source. Bids, payments and
              unverified amounts are not copied into purchase costs.
            </p>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold text-[var(--t3)]">
            {valuation.label}
          </p>
          {valuation.supported && props.sellEstimate != null ? (
            <>
              <p className="mt-1 font-semibold">
                {money(props.sellEstimate)} estimate
              </p>
              <button
                type="button"
                className="mt-1 min-h-11 text-left text-sm font-semibold text-[var(--blue)] underline underline-offset-4"
                onClick={() => setField("resale", String(props.sellEstimate))}
              >
                Use resale estimate
              </button>
            </>
          ) : (
            <p className="mt-2 text-xs text-[var(--t3)]">
              Enter a researched resale assumption below. A stored reference
              alone cannot establish resale value.
            </p>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-[var(--t3)]">
        Enter every cost, including 0 where none applies. Percentage fees are
        added to fixed fees; avoid counting them twice. Recheck fee and tax
        quotes when the purchase price changes.
      </p>
      <div className="mt-4 grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-5 lg:order-1">
          {groups.map((group) => (
            <fieldset key={group.title} className="min-w-0">
              <legend className="mb-3 text-sm font-bold">{group.title}</legend>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {group.fields.map((field) => {
                  const meta = SCENARIO_FIELDS[field];
                  const percent =
                    field === "buyerFeeRate" || field === "sellingFeeRate";
                  return (
                    <div key={field} className="min-w-0">
                      <label
                        htmlFor={`${id}-${field}`}
                        className="block text-sm font-semibold"
                      >
                        {meta.label} {percent ? "(%)" : "($)"}
                      </label>
                      <input
                        id={`${id}-${field}`}
                        data-scenario-field={field}
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        value={draft[field]}
                        onChange={(event) =>
                          setField(field, event.target.value)
                        }
                        aria-invalid={!!result.errors[field]}
                        aria-describedby={`${id}-${field}-help`}
                        placeholder="Enter amount"
                        className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3 text-base text-[var(--t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                      />
                      <p
                        id={`${id}-${field}-help`}
                        className={`mt-1 text-xs ${result.errors[field] ? "text-[var(--red)]" : "text-[var(--t3)]"}`}
                      >
                        {result.errors[field] || meta.help}
                      </p>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <div className="order-first min-w-0 lg:order-2">
          <div
            ref={resultRef}
            tabIndex={-1}
            className="scroll-mt-24 space-y-4 rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-4 lg:sticky lg:top-24"
            data-testid="flip-scenario-result"
          >
            {!m ? (
              <>
                <p className="font-semibold" role="status">
                  {result.status === "invalid"
                    ? "Check your entries"
                    : `${scenarioFields.length - missing.length} of ${scenarioFields.length} inputs ready`}
                </p>
                <p className="text-sm text-[var(--t3)]">
                  {result.status === "invalid"
                    ? "Correct the marked fields to calculate."
                    : "Profit, break-even and a purchase limit appear when every amount is entered."}
                </p>
                <a
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)] underline underline-offset-4"
                  href={`#${id}-${missing[0]}`}
                >
                  Next: {SCENARIO_FIELDS[missing[0]].label}
                </a>
                <details>
                  <summary className="min-h-11 cursor-pointer py-3 text-sm text-[var(--t3)]">
                    See remaining inputs ({missing.length})
                  </summary>
                  <ul className="space-y-1 text-sm">
                    {missing.map((field) => (
                      <li key={field}>
                        <a
                          className="inline-flex min-h-11 items-center text-[var(--blue)] underline underline-offset-4"
                          href={`#${id}-${field}`}
                        >
                          {SCENARIO_FIELDS[field].label}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <>
                <div>
                  <p className="text-sm text-[var(--t3)]">
                    Scenario net {m.profit < 0 ? "loss" : "profit"}
                  </p>
                  <p
                    data-testid="scenario-profit"
                    className={`mt-1 break-words font-mono text-3xl font-bold ${m.profit < 0 ? "text-[var(--red)]" : "text-[var(--t1)]"}`}
                  >
                    {money(m.profit)}
                  </p>
                  <p className="mt-1 text-sm text-[var(--t3)]">
                    {m.targetMet ? "Meets" : "Below"} your target by{" "}
                    {money(Math.abs(m.targetGap))} in this scenario.
                  </p>
                </div>
                <dl className="space-y-3 text-sm">
                  <Metric label="All-in cost" value={money(m.totalCost)} />
                  <Metric
                    label="Costs before selling"
                    value={money(m.investedBeforeSale)}
                  />
                  <Metric
                    label="Buyer fees included"
                    value={money(m.buyerCost)}
                  />
                  <Metric
                    label="Selling fees included"
                    value={money(m.sellingCost)}
                  />
                  <Metric
                    label="Break-even resale"
                    value={money(m.breakEvenResale)}
                  />
                  <Metric
                    label="ROI on all-in cost"
                    value={`${m.roiPct.toFixed(1)}%`}
                  />
                  <Metric
                    label="Profit / resale (margin)"
                    value={`${m.marginPct.toFixed(1)}%`}
                  />
                </dl>
                <div className="border-t border-[var(--b2)] pt-3">
                  <p className="text-sm font-semibold">
                    Purchase limit for your profit target
                  </p>
                  <p
                    data-testid="scenario-ceiling"
                    className="mt-1 font-mono text-xl font-bold"
                  >
                    {m.purchaseCeiling != null
                      ? money(m.purchaseCeiling)
                      : "No positive purchase price fits"}
                  </p>
                  <p className="mt-1 text-xs text-[var(--t3)]">
                    Vehicle price before buyer fees and tax, using your entered
                    fees and costs. A scenario limit is not a verified maximum
                    bid.
                  </p>
                </div>
                <div className="border-t border-[var(--b2)] pt-3">
                  <h4 className="text-sm font-semibold">
                    If the sale goes worse
                  </h4>
                  <p className="mt-1 text-xs text-[var(--t3)]">
                    Stress tests, not forecasts. Holding uses your entered total
                    cost.
                  </p>
                  <dl className="mt-3 space-y-3 text-sm">
                    {m.stress.map((row) => (
                      <Metric
                        key={row.label}
                        label={row.label}
                        value={money(row.profit)}
                      />
                    ))}
                  </dl>
                </div>
              </>
            )}
            <p className="border-t border-[var(--b2)] pt-3 text-xs text-[var(--t3)]">
              Before buying: verify VIN, title, inspection, dated sale
              comparisons and current all-in quotes. Your entries do not mark
              these checks complete.
            </p>
          </div>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-[var(--b1)] pt-4">
        {m && (
          <button
            type="button"
            onClick={() => {
              resultRef.current?.scrollIntoView({ block: "start" });
              resultRef.current?.focus({ preventScroll: true });
            }}
            className="min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-semibold lg:hidden"
          >
            Review results
          </button>
        )}
        <button
          type="button"
          disabled={!storageKey || result.status === "invalid"}
          onClick={save}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] disabled:opacity-50"
        >
          Save draft on this device
        </button>
        <button
          type="button"
          onClick={clear}
          className="min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-semibold"
        >
          Clear scenario
        </button>
        <p role="status" className="text-xs text-[var(--t3)]">
          {savedAt
            ? `Saved ${new Date(savedAt).toLocaleString()} on this device. ${dirty ? "Unsaved changes. " : ""}Recheck prices and quotes before using.`
            : "Not saved. Save a draft to return to it on this device. This does not log a purchase or sale."}
        </p>
      </div>
      {storageError && (
        <p role="alert" className="mt-3 text-sm text-[var(--red)]">
          {storageError}
        </p>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3">
      <dt className="min-w-0 text-[var(--t3)]">{label}</dt>
      <dd className="shrink-0 font-mono font-semibold text-[var(--t1)]">
        {value}
      </dd>
    </div>
  );
}
