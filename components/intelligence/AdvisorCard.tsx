"use client";

import React from "react";
import { Ban, Check, Clock, X } from "lucide-react";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA_YET,
  type AdvisorView,
} from "@/lib/intelligence/advisor-view";
import { useAdvisorRead } from "@/hooks/useAdvisorRead";

// The advisor card (docs/intelligence-advisor.md, Sara's layout): verdict pill as the heading,
// "Buy at or under $X" as the one big number, the headline, then Fair value and (flip desks only)
// "Profit · sell in {state}". With too little evidence it says "Not enough data" and shows no
// verdict or price. Colour is never the only signal: every verdict has its word and an icon.

export const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const VERDICT_TONE = {
  buy: { Icon: Check, tint: "var(--green)", bg: "var(--glo)", bd: "var(--gbd)" },
  wait: { Icon: Clock, tint: "var(--amber-d)", bg: "var(--amber-lo)", bd: "var(--amber-bd)" },
  // Pass is neutral: only the icon and pill border are tinted, never a red block.
  pass: { Icon: X, tint: "var(--red)", bg: "var(--s1)", bd: "var(--b2)" },
} as const;

export function VerdictPill({
  verdict,
  word,
  size = "lg",
}: {
  verdict: "buy" | "wait" | "pass";
  word: string;
  size?: "lg" | "sm";
}) {
  const t = VERDICT_TONE[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-black text-[var(--t1)] ${
        size === "lg" ? "px-3 py-1 text-lg" : "px-2 py-0.5 text-xs"
      }`}
      style={{ background: t.bg, borderColor: t.bd }}
      data-verdict={verdict}
    >
      <t.Icon
        aria-hidden
        className={size === "lg" ? "h-4 w-4" : "h-3 w-3"}
        style={{ color: t.tint }}
      />
      {word}
    </span>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-bold text-[var(--t4)]">{label}</div>
      <div className="text-base font-black text-[var(--t1)]">{value}</div>
      {note && <div className="text-[11px] text-[var(--t4)]">{note}</div>}
    </div>
  );
}

export function AdvisorCardView({
  view,
  className = "",
  children,
}: {
  view: AdvisorView;
  className?: string;
  /** Extra evidence for the Why sheet (deal page passes its score / proof blocks). */
  children?: React.ReactNode;
}) {
  const why = children ? (
    <details className="mt-2 text-sm text-[var(--t3)]">
      <summary className="min-h-11 cursor-pointer py-2 font-bold text-[var(--t2)]">
        Why
      </summary>
      {children}
    </details>
  ) : null;
  if (view.state === "not_live") {
    return (
      <section
        className={`glass-panel p-4 ${className}`}
        data-testid="advisor-card"
        data-advisor-state="not_live"
      >
        <h2 className="flex items-center gap-2 text-lg font-black text-[var(--t1)]">
          <Ban aria-hidden className="h-4 w-4 text-[var(--t4)]" />
          {view.headline}
        </h2>
        <p className="mt-1 text-sm text-[var(--t3)]">{view.reason}</p>
        {why}
      </section>
    );
  }
  if (view.state === "fair_only") {
    return (
      <section
        className={`glass-panel p-4 ${className}`}
        data-testid="advisor-card"
        data-advisor-state="fair_only"
      >
        <h2 className="text-lg font-black text-[var(--t1)]">{view.headline}</h2>
        <p className="mt-1 text-sm text-[var(--t3)]">{view.reason}</p>
        <div className="mt-3">
          <Stat
            label="Fair value"
            value={money(view.fairValue.value)}
            note={view.fairValue.basisLabel}
          />
          {view.confidenceNote && (
            <p className="mt-1 text-xs text-[var(--t4)]">{view.confidenceNote}</p>
          )}
        </div>
        {why}
      </section>
    );
  }
  if (view.state === "insufficient") {
    return (
      <section
        className={`glass-panel p-4 ${className}`}
        data-testid="advisor-card"
        data-advisor-state="insufficient"
      >
        <h2 className="text-lg font-black text-[var(--t1)]">{view.headline}</h2>
        <p className="mt-1 text-sm text-[var(--t3)]">{view.reason}</p>
        {why}
      </section>
    );
  }
  return (
    <section
      className={`glass-panel p-4 ${className}`}
      data-testid="advisor-card"
      data-advisor-state="ready"
    >
      <h2 className="m-0">
        <VerdictPill verdict={view.verdict} word={view.word} />
      </h2>
      {view.confidenceNote && (
        <p className="mt-1 text-xs text-[var(--t4)]">{view.confidenceNote}</p>
      )}
      {view.buyCeiling && (
        <p className="mt-3 text-[var(--t1)]">
          <span className="block text-xs font-bold text-[var(--t4)]">Buy at or under</span>
          <span className="text-3xl font-black">{money(view.buyCeiling.value)}</span>
          <span className="ml-2 text-[11px] text-[var(--t4)]">{view.buyCeiling.basisLabel}</span>
        </p>
      )}
      <p className="mt-2 text-sm text-[var(--t2)]">{view.headline}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat
          label="Fair value"
          value={money(view.fairValue.value)}
          note={view.fairValue.basisLabel}
        />
        {view.profit && (
          <Stat
            label={
              view.sellMarket?.state
                ? `Profit · sell in ${view.sellMarket.state}`
                : "Profit"
            }
            value={money(view.profit.value)}
            note={view.profit.basisLabel}
          />
        )}
      </div>
      <details className="mt-3 text-sm text-[var(--t3)]">
        <summary className="min-h-11 cursor-pointer py-2 font-bold text-[var(--t2)]">
          Why
        </summary>
        <ul className="list-disc space-y-1 pl-5">
          {view.why.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {view.breakdown.length > 0 && (
          <details className="mt-2" data-testid="advisor-breakdown">
            <summary className="min-h-11 cursor-pointer py-2 font-bold text-[var(--t2)]">
              The math
            </summary>
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 font-mono text-xs">
              {view.breakdown.map((l) => (
                <React.Fragment key={l.label}>
                  <dt className={l.sign === "=" ? "font-bold text-[var(--t1)]" : ""}>
                    {l.label}
                  </dt>
                  <dd className={`text-right ${l.sign === "=" ? "font-bold text-[var(--t1)]" : ""}`}>
                    {l.sign === "-" ? "−" : l.sign === "+" ? "+" : "="} {money(l.value)}
                  </dd>
                </React.Fragment>
              ))}
            </dl>
          </details>
        )}
        <p className="mt-2 text-xs text-[var(--t4)]">
          {view.compsLine} Confidence: {view.confidence}.
        </p>
        {view.assumptions.length > 0 && (
          <p className="mt-1 text-xs text-[var(--t4)]">
            Assumptions: {view.assumptions.join(" · ")}
          </p>
        )}
        {children}
      </details>
    </section>
  );
}

/** Fetches the read for a tracked deal and renders the card (deal detail). */
export function AdvisorCard({
  deal,
  flipDesk,
  homeState,
  className = "",
  children,
  onView,
}: {
  deal: Record<string, unknown> | null | undefined;
  flipDesk: boolean;
  /** Buyer's home state, offered to the API as a sell market. */
  homeState?: string | null;
  className?: string;
  children?: React.ReactNode;
  /** Lets the page key its primary action off the verdict. */
  onView?: (view: AdvisorView | null) => void;
}) {
  const body = advisorRequestFor(deal, { homeState });
  const { data, error, isLoading } = useAdvisorRead(body);
  const view: AdvisorView | null =
    body && isLoading
      ? null
      : body && error
        ? {
            state: "insufficient",
            headline: NOT_ENOUGH_DATA_YET,
            reason: "We couldn't get market data for this car right now. Try again later.",
          }
        : advisorView(body ? data : null, { flipDesk });
  const viewKey = view ? `${view.state}:${view.state === "ready" ? view.verdict : ""}` : "loading";
  React.useEffect(() => {
    onView?.(view);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);
  if (!view)
    return (
      <div
        className={`shimmer h-28 rounded-[var(--r3)] ${className}`}
        aria-busy="true"
        aria-label="Checking the market"
      />
    );
  return (
    <AdvisorCardView className={className} view={view}>
      {children}
    </AdvisorCardView>
  );
}
