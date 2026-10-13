"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { daysOnMarket } from "@/lib/intelligence/days-on-market";
import { PriceMilesChart } from "@/components/deal/PriceMilesChart";
import { mileageCurvePrice } from "@/lib/valuation/mileage-curve";
import { reportedPrice } from "@/lib/deals/reported-price";
import { buyTerm } from "@/lib/deal-terms";
import { ErrorState } from "@/components/shared/ErrorState";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Market evidence unavailable");
  return response.json();
};
const money = (v: any) =>
  v == null
    ? "—"
    : !Number.isFinite(Number(v))
      ? "—"
      : new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(Number(v));

const SRC_LABEL: Record<string, string> = {
  facebook_marketplace: "Facebook",
  craigslist: "Craigslist",
  ebay_motors: "eBay",
  cars_com: "Cars.com",
  autotrader: "AutoTrader",
  cargurus: "CarGurus",
};
const srcName = (s: string) => SRC_LABEL[s] || (s || "").replace(/_/g, " ");

/**
 * Market Context — Visor-style intelligence on the deal page: days-on-market, the depreciation
 * curve ($/1k mi + above/below), a time-travel price snapshot, and the cross-source price table.
 * Each block self-hides when its data isn't available.
 */
export function MarketContext({ dealId }: { dealId: string }) {
  const {
    data: src,
    error: sourceError,
    isLoading,
    mutate: retrySources,
  } = useSWR(`/api/deals/${dealId}/sources`, fetcher, {
    revalidateOnFocus: false,
  });
  const base = src?.base;
  const make = base?.make;
  const model = base?.model;
  const year = base?.year;

  const qs =
    make && model
      ? `make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${year ? `&year=${year}` : ""}`
      : null;
  const {
    data: dep,
    error: depError,
    mutate: retryDep,
  } = useSWR(qs ? `/api/market/depreciation?${qs}` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: snap,
    error: snapError,
    mutate: retrySnap,
  } = useSWR(qs ? `/api/market/snapshot?${qs}&daysAgo=30` : null, fetcher, {
    revalidateOnFocus: false,
  });
  const {
    data: sold,
    error: soldError,
    mutate: retrySold,
  } = useSWR(qs ? `/api/market/sold?${qs}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  if (sourceError)
    return (
      <ErrorState
        compact
        title="Market evidence unavailable"
        message="We couldn't check listing sources. Try again shortly."
        onRetry={() => void retrySources()}
      />
    );
  if (isLoading)
    return (
      <p role="status" className="text-sm text-[var(--t3)]">
        Loading market evidence...
      </p>
    );
  if (!base)
    return (
      <p className="text-sm text-[var(--t3)]">
        Market evidence is not available for this listing yet.
      </p>
    );
  const partialFailure = depError || snapError || soldError;

  const dom = daysOnMarket(base.firstSeenAt);

  // Is this car priced below the depreciation curve for its mileage? (a strengthening GO signal)
  let curveNote: { text: string; color: string } | null = null;
  if (
    dep?.depreciationPer1000Miles != null &&
    dep.trend &&
    base.mileage &&
    base.askPrice
  ) {
    const expected = mileageCurvePrice(dep.trend, base.mileage);
    if (expected != null) {
      const diff = base.askPrice - expected;
      const pct = Math.round((Math.abs(diff) / expected) * 100);
      curveNote =
        diff < 0
          ? {
              text: `${pct}% below the asking-price curve for its miles`,
              color: "var(--green)",
            }
          : {
              text: `${pct}% above the asking-price curve for its miles`,
              color: "var(--red)",
            };
    }
  }

  const sources: any[] = src?.sources ?? [];
  const showTable = sources.length > 1;

  // Nothing meaningful to show.
  if (
    dom == null &&
    !dep?.depreciationPer1000Miles &&
    snap?.change == null &&
    !showTable &&
    !(sold?.count > 0) &&
    !partialFailure
  )
    return (
      <p className="text-sm text-[var(--t3)]">
        Not enough market observations for this vehicle yet.
      </p>
    );

  return (
    <div className="min-w-0 space-y-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
        Market context
      </p>
      {partialFailure && (
        <ErrorState
          compact
          title="Some market evidence unavailable"
          message="Available evidence remains below. Retry to check the missing observations."
          onRetry={() => {
            if (depError) void retryDep();
            if (snapError) void retrySnap();
            if (soldError) void retrySold();
          }}
        />
      )}

      {/* Top row: days on market + depreciation + time travel */}
      <div className="flex flex-wrap gap-2">
        {dom != null && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <span className="text-xs font-bold text-[var(--t2)]">
              {dom}d since first observed
            </span>
          </div>
        )}
        {dep?.depreciationPer1000Miles != null && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <span className="text-xs font-bold text-[var(--t2)]">
              {money(dep.depreciationPer1000Miles)}/1k mi
            </span>
            <span className="text-[10px] text-[var(--t4)]">depreciation</span>
          </div>
        )}
        {snap?.change != null && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <span
              className="text-xs font-bold"
              style={{ color: snap.change > 0 ? "var(--red)" : "var(--green)" }}
            >
              {snap.change > 0 ? "+" : ""}
              {money(snap.change)} / 30d
            </span>
            <span className="text-[10px] text-[var(--t4)]">
              vs {money(snap.historicalAvg)} then
            </span>
          </div>
        )}
      </div>

      {curveNote && (
        <p className="text-sm font-semibold" style={{ color: curveNote.color }}>
          {curveNote.text}.
        </p>
      )}

      {/* Price-vs-miles scatter — this car against the market curve */}
      {dep?.points && dep.points.length >= 6 && (
        <PriceMilesChart
          points={dep.points}
          trend={dep.trend}
          here={{ mileage: base.mileage, price: base.askPrice }}
        />
      )}

      {/* Recent SOLD comps — actual transaction prices (hides until sold data exists) */}
      {sold?.count > 0 && (
        <div
          className="rounded-[var(--r2)] p-3"
          style={{ background: "var(--glo)" }}
        >
          <p className="text-xs font-bold text-[var(--green)]">
            Recent sold comps: avg {money(sold.avg)}{" "}
            <span className="font-semibold text-[var(--t3)]">
              ({money(sold.low)}–{money(sold.high)}, {sold.count} sales / 90d)
            </span>
          </p>
        </div>
      )}

      {/* Cross-source price table */}
      {showTable && (
        <div>
          <p className="text-xs text-[var(--t3)] mb-1.5">
            This VIN appears in {sources.length} reported listings. Price types
            and availability may differ.
          </p>
          <div className="rounded-[var(--r2)] overflow-hidden border border-[var(--b1)] divide-y divide-[var(--b1)]">
            {sources.map((s) => {
              const href =
                typeof s.url === "string" && /^https?:\/\//i.test(s.url)
                  ? s.url
                  : null;
              const Row = href ? "a" : "div";
              return (
                <Row
                  key={s.id}
                  href={href || undefined}
                  target={href ? "_blank" : undefined}
                  rel={href ? "noopener noreferrer" : undefined}
                  className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm transition-colors"
                  style={
                    s.isThis ? { background: "var(--amber-lo)" } : undefined
                  }
                >
                  <span className="min-w-0 break-words text-[var(--t2)] capitalize">
                    {srcName(s.source)}
                    {s.isThis && (
                      <span className="text-[10px] text-[var(--amber-d)] font-bold">
                        {" "}
                        · this listing
                      </span>
                    )}
                    {s.state && (
                      <span className="text-[var(--t4)]"> · {s.state}</span>
                    )}
                    {!href && (
                      <span className="block text-xs text-[var(--t4)]">
                        Source link unavailable
                      </span>
                    )}
                  </span>
                  <Mono
                    className="font-bold text-[var(--t1)]"
                    style={{ fontFamily: "var(--fm)" }}
                  >
                    <span className="block text-right text-[10px] font-normal">
                      {buyTerm(s.source).priceLabel}
                    </span>
                    {reportedPrice(s.askPrice)}
                  </Mono>
                </Row>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
