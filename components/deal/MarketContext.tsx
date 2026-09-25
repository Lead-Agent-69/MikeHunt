"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { daysOnMarket, domTier } from "@/lib/intelligence/days-on-market";
import { PriceMilesChart } from "@/components/deal/PriceMilesChart";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v) || 0);

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
  const { data: src } = useSWR(`/api/deals/${dealId}/sources`, fetcher, {
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
  const { data: dep } = useSWR(
    qs ? `/api/market/depreciation?${qs}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: snap } = useSWR(
    qs ? `/api/market/snapshot?${qs}&daysAgo=30` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const { data: sold } = useSWR(qs ? `/api/market/sold?${qs}` : null, fetcher, {
    revalidateOnFocus: false,
  });

  if (!base) return null;

  const dom = daysOnMarket(base.firstSeenAt);
  const tier = dom != null ? domTier(dom) : null;

  // Is this car priced below the depreciation curve for its mileage? (a strengthening GO signal)
  let curveNote: { text: string; color: string } | null = null;
  if (
    dep?.depreciationPer1000Miles != null &&
    dep.trend &&
    base.mileage &&
    base.askPrice
  ) {
    const [a, b] = dep.trend;
    const slope = (b.price - a.price) / (b.mileage - a.mileage);
    const expected = Math.round(a.price + slope * base.mileage);
    if (expected > 0) {
      const diff = base.askPrice - expected;
      const pct = Math.round((Math.abs(diff) / expected) * 100);
      curveNote =
        diff < 0
          ? {
              text: `${pct}% below the curve for its miles`,
              color: "var(--green)",
            }
          : {
              text: `${pct}% above the curve for its miles`,
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
    !(sold?.count > 0)
  )
    return null;

  return (
    <div className="glass-panel p-5 mt-4 space-y-4">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
        Market context
      </p>

      {/* Top row: days on market + depreciation + time travel */}
      <div className="flex flex-wrap gap-2">
        {tier && dom != null && (
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <span className="text-xs font-bold" style={{ color: tier.color }}>
              {dom}d on market
            </span>
            <span className="text-[10px] text-[var(--t4)]">· {tier.label}</span>
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
            This VIN appears on {src.count} sources · spread {money(src.spread)}
          </p>
          <div className="rounded-[var(--r2)] overflow-hidden border border-[var(--b1)] divide-y divide-[var(--b1)]">
            {sources.map((s) => (
              <a
                key={s.id}
                href={s.url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 text-sm hover:bg-[var(--s1)] transition-colors"
                style={s.isThis ? { background: "var(--amber-lo)" } : undefined}
              >
                <span className="text-[var(--t2)] capitalize">
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
                </span>
                <Mono
                  className="font-bold text-[var(--t1)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {money(s.askPrice)}
                </Mono>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
