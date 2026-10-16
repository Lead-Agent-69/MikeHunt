"use client";

import { useRef, useState } from "react";
import { BarChart3, Camera, Clock3, Sparkles } from "lucide-react";
import { reportedPrice } from "@/lib/deals/reported-price";
import type { MarketSummary } from "@/lib/market/explorer";

export function MarketIntelligence({
  summary,
  query,
  capped,
}: {
  summary?: MarketSummary;
  query: string;
  capped?: boolean;
}) {
  const [brief, setBrief] = useState<{
    query: string;
    text: string;
    ai?: boolean;
  } | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const scope = useRef(query);
  scope.current = query;
  if (!summary) return null;
  const n = summary.count;
  const visible = brief?.query === query ? brief : null;
  const generate = async () => {
    const requested = query;
    setPending(requested);
    try {
      const response = await fetch("/api/market/brief", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: requested }),
      });
      const result = await response.json();
      if (scope.current !== requested) return;
      setBrief({
        query: requested,
        text: response.ok
          ? result.report
          : result.error || "The market brief is unavailable. Try again.",
        ai: response.ok && result.ai,
      });
    } catch {
      if (scope.current === requested)
        setBrief({
          query: requested,
          text: "The market brief could not be loaded. Try again.",
        });
    } finally {
      setPending((current) => (current === requested ? null : current));
    }
  };
  return (
    <section
      aria-label="Market intelligence"
      className="rounded-2xl border border-[var(--b1)] bg-[var(--s1)] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold">
            <BarChart3 className="h-4 w-4 text-[var(--blue)]" />
            Market intelligence
          </h2>
          <p className="mt-1 text-xs text-[var(--t3)]">
            From this filtered inventory{capped ? " sample" : ""} · asking
            evidence, not completed sales
          </p>
        </div>
        <button
          type="button"
          disabled={pending === query || !n}
          onClick={() => void generate()}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs font-semibold disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" />
          {pending === query ? "Preparing brief…" : "AI market brief"}
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          {
            label: "Indexed matches",
            value: n.toLocaleString(),
            detail: `${Object.keys(summary.sources).length} sources in results`,
            icon: BarChart3,
          },
          {
            label: "Median cash asking price",
            value: reportedPrice(summary.medianAsk),
            detail: `${summary.askingSample.toLocaleString()} of ${n.toLocaleString()} matches qualify (${n ? ((summary.askingSample / n) * 100).toFixed(1) : "0"}%)`,
            icon: BarChart3,
          },
          {
            label: "Source photos",
            value: `${summary.withPhotos.toLocaleString()} / ${n.toLocaleString()}`,
            detail: "Photo URLs reported by sources",
            icon: Camera,
          },
          {
            label: "Seen in last 24h",
            value: summary.fresh24h.toLocaleString(),
            detail: "Last source observation",
            icon: Clock3,
          },
        ].map((item) => (
          <div key={item.label} className="rounded-xl bg-[var(--s2)] p-3">
            <dt className="text-[10px] font-semibold text-[var(--t3)]">
              {item.label}
            </dt>
            <dd className="mt-1 text-lg font-extrabold tabular-nums md:text-xl">
              {item.value}
            </dd>
            <dd className="mt-1 text-[10px] text-[var(--t3)]">{item.detail}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--t3)]">
        <span>
          {(summary.priceKinds.current_bid || 0).toLocaleString()} current bids
        </span>
        <span>
          {(summary.priceKinds.buy_now || 0).toLocaleString()} buy-now listings
        </span>
        <span>
          {Object.entries(summary.priceKinds)
            .filter(
              ([kind]) => !["asking", "current_bid", "buy_now"].includes(kind),
            )
            .reduce((total, [, count]) => total + count, 0)
            .toLocaleString()}{" "}
          payment, reference or unverified amounts
        </span>
      </div>
      {n > 0 && (
        <details className="mt-2 text-xs leading-relaxed text-[var(--t3)]">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">
            {summary.askingSample < 5
              ? "Thin asking evidence · how to read these prices"
              : "How to read these prices"}
          </summary>
          <p>
            {summary.askingSample >= 5
              ? `The median covers ${summary.askingSample} qualified asking listings in this filtered mix of vehicles. It is not a valuation of an individual vehicle; compare year, mileage and condition.`
              : "Cash asking evidence is thin in this search. Confirm full purchase prices at the source before comparing value."}{" "}
            Bids, payments and reference values are excluded from the
            asking-price median. Fees, tax and transport are additional.
          </p>
        </details>
      )}
      {visible && (
        <div
          role="status"
          className="mt-3 rounded-xl border border-[var(--b1)] p-3"
        >
          <p className="mb-1 text-[10px] font-bold uppercase text-[var(--blue)]">
            {visible.ai
              ? "AI priorities · verified market facts"
              : "Evidence brief"}
          </p>
          <p className="text-sm leading-relaxed text-[var(--t2)]">
            {visible.text}
          </p>
        </div>
      )}
    </section>
  );
}
