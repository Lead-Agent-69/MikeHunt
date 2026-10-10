"use client";

import React from "react";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA,
  type AdvisorNumber,
  type AdvisorView,
} from "@/lib/intelligence/advisor-view";
import { useAdvisorRead } from "@/hooks/useAdvisorRead";

// The MikeHunt advisor card (docs/intelligence-advisor.md): one verb (Buy / Wait / Pass),
// "Buy ≤ $X" and fair value. Profit and where to sell show only on flip desks. Every number shows
// its basis; with too little evidence the card says "Not enough data" and shows no verdict or price.

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const VERDICT_COLOR: Record<"buy" | "wait" | "pass", string> = {
  buy: "var(--green)",
  wait: "var(--amber-d)",
  pass: "var(--red)",
};

function Figure({
  label,
  n,
  suffix,
}: {
  label: string;
  n: AdvisorNumber | null;
  suffix?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-wide text-[var(--t4)]">
        {label}
      </div>
      <div className="text-lg font-black text-[var(--t1)]">
        {n ? `${money(n.value)}${suffix ? ` ${suffix}` : ""}` : NOT_ENOUGH_DATA}
      </div>
      {n && <div className="text-[11px] text-[var(--t4)]">{n.basisLabel}</div>}
    </div>
  );
}

export function AdvisorCardView({
  view,
  className = "",
}: {
  view: AdvisorView;
  className?: string;
}) {
  if (view.state === "insufficient") {
    return (
      <section
        className={`glass-panel p-4 ${className}`}
        data-testid="advisor-card"
        data-advisor-state="insufficient"
      >
        <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--t4)]">
          MikeHunt read
        </h2>
        <p className="mt-1 text-base font-black text-[var(--t2)]">
          {view.headline}
        </p>
        <p className="mt-1 text-sm text-[var(--t3)]">{view.reason}</p>
      </section>
    );
  }
  return (
    <section
      className={`glass-panel p-4 ${className}`}
      data-testid="advisor-card"
      data-advisor-state="ready"
    >
      <h2 className="text-xs font-bold uppercase tracking-wide text-[var(--t4)]">
        MikeHunt read
      </h2>
      <p
        className="mt-1 text-2xl font-black"
        style={{ color: VERDICT_COLOR[view.verdict] }}
      >
        {view.word}
      </p>
      <p className="mt-0.5 text-sm text-[var(--t2)]">{view.headline}</p>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Figure label="Buy ≤" n={view.buyCeiling} />
        <Figure label="Fair value" n={view.fairValue} />
        {view.profit && <Figure label="Profit after costs" n={view.profit} />}
        {view.sellMarket && (
          <Figure
            label="Sell"
            n={view.sellMarket}
            suffix={
              view.sellMarket.state ? `in ${view.sellMarket.state}` : undefined
            }
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
        <p className="mt-2 text-xs text-[var(--t4)]">
          {view.compsLine} Confidence: {view.confidence}.
        </p>
        {view.assumptions.length > 0 && (
          <p className="mt-1 text-xs text-[var(--t4)]">
            Assumptions: {view.assumptions.join(" · ")}
          </p>
        )}
      </details>
    </section>
  );
}

/** Fetches the read for a tracked deal and renders the card (deal detail). */
export function AdvisorCard({
  deal,
  flipDesk,
  className = "",
}: {
  deal: Record<string, unknown> | null | undefined;
  flipDesk: boolean;
  className?: string;
}) {
  const body = advisorRequestFor(deal);
  const { data, error, isLoading } = useAdvisorRead(body);
  if (body && isLoading)
    return (
      <div
        className={`shimmer h-28 rounded-[var(--r3)] ${className}`}
        aria-busy="true"
        aria-label="Loading the MikeHunt read"
      />
    );
  if (body && error)
    return (
      <AdvisorCardView
        className={className}
        view={{
          state: "insufficient",
          headline: "Read unavailable",
          reason:
            "We couldn't get market data for this car right now. Try again later.",
        }}
      />
    );
  return (
    <AdvisorCardView
      className={className}
      view={advisorView(body ? data : null, { flipDesk })}
    />
  );
}
