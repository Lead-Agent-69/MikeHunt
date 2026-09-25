"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";

// /arbitrage — "buy there, sell here." Tailored to the dealer's home state, every out-of-state deal is
// scored for import profit (resale − ask − real transport − selling load) from REAL inventory, tiered by
// haul: Local (no transport) · Regional (close, fast money) · National (whole-country spreads).

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;

type Opp = {
  deal: any;
  arbitrage: {
    sourceState: string;
    targetRegion?: { state: string };
    arbitrage: {
      sourcePrice: number;
      targetPrice: number;
      transportCost: number;
      potentialProfit: number;
      profitMargin: number;
      distance: number;
    };
  };
};

export default function ArbitragePage() {
  const { data, isLoading } = useSWR("/api/arbitrage", fetcher, {
    keepPreviousData: true,
  });
  const [tab, setTab] = React.useState<"regional" | "national" | "local">(
    "regional",
  );

  const home = data?.homeState || "—";
  const s = data?.summary || {};
  const regional: Opp[] = data?.regionalArbitrage || [];
  const national: Opp[] = data?.nationalArbitrage || [];
  const local: any[] = data?.localDeals || [];
  const routes = data?.topRoutes || [];

  // Land on a populated tier on first load — keep Regional (the "close money") when it has cars, else
  // fall to National, else Local. Doesn't override a manual choice.
  const autoSet = React.useRef(false);
  React.useEffect(() => {
    if (autoSet.current || !data) return;
    autoSet.current = true;
    if ((s.regional ?? 0) === 0)
      setTab((s.national ?? 0) > 0 ? "national" : "local");
  }, [data, s.regional, s.national]);

  const tabs = [
    {
      key: "regional" as const,
      label: "Regional",
      sub: "close · fast",
      n: s.regional,
    },
    {
      key: "national" as const,
      label: "National",
      sub: "whole country",
      n: s.national,
    },
    {
      key: "local" as const,
      label: `Local (${home})`,
      sub: "no transport",
      n: s.local,
    },
  ];

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Header + summary */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-[var(--t1)]">
            Geographic arbitrage
          </h1>
          <p className="text-xs text-[var(--t4)]">
            {isLoading && !data ? (
              "Loading…"
            ) : (
              <>
                Buy out-of-state, sell in{" "}
                <strong className="text-[var(--t2)]">{home}</strong>
                {data?.tailored
                  ? " · tailored to your lot"
                  : " · set your home state in Settings to tailor"}
              </>
            )}
          </p>
        </div>
        <div className="flex gap-4">
          <Stat
            label="Best single flip"
            value={money(s.bestProfit)}
            accent="var(--green)"
          />
          <Stat label="Regional profit pool" value={money(s.regionalProfit)} />
          <Stat label="National profit pool" value={money(s.nationalProfit)} />
        </div>
      </div>

      {/* Top routes */}
      {routes.length > 0 && (
        <div
          className="rounded-[var(--r3)] p-3"
          style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
        >
          <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
            Best import routes → {home}
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {routes.map((r: any) => (
              <div
                key={r.targetState}
                className="shrink-0 rounded-[var(--r2)] px-3 py-2"
                style={{ background: "var(--s2)", minWidth: 150 }}
              >
                <div className="flex items-center gap-1.5 text-sm font-bold text-[var(--t1)]">
                  {r.targetState} <Ico name="arrow" size={12} /> {home}
                  {r.regional && (
                    <span
                      className="rounded-full px-1.5 text-[9px] font-bold"
                      style={{
                        background: "var(--glo)",
                        color: "var(--green)",
                      }}
                    >
                      close
                    </span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-[var(--t3)]">
                  {r.opportunities} cars · {money(r.totalProfit)} pool
                </div>
                <div className="font-mono text-[10px] text-[var(--t4)]">
                  ~{Math.round(r.distance)}mi · {money(r.estimatedCost)} haul ·{" "}
                  {r.estimatedTime}d
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tier tabs */}
      <div className="flex gap-1.5">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex-1 rounded-[var(--r2)] px-3 py-2 text-left transition-all"
            style={
              tab === t.key
                ? { background: "var(--grad)", color: "#fff" }
                : { background: "var(--s1)", color: "var(--t3)" }
            }
          >
            <div className="text-sm font-bold">
              {t.label}{" "}
              <span className={tab === t.key ? "opacity-80" : "opacity-50"}>
                {t.n ?? 0}
              </span>
            </div>
            <div
              className={`text-[10px] ${tab === t.key ? "opacity-80" : "opacity-50"}`}
            >
              {t.sub}
            </div>
          </button>
        ))}
      </div>

      {/* Opportunity list */}
      <div className="flex flex-col gap-2">
        {tab === "local" ? (
          local.length ? (
            local.map((d) => <LocalRow key={d.id} d={d} />)
          ) : (
            <Empty text={`No active ${home} inventory right now.`} />
          )
        ) : (tab === "regional" ? regional : national).length ? (
          (tab === "regional" ? regional : national).map((o, i) => (
            <OppRow key={o.deal.id || i} o={o} />
          ))
        ) : (
          <Empty
            text={
              isLoading
                ? "Scanning the market…"
                : `No ${tab} import opportunities clearing $1.5k after transport yet.`
            }
          />
        )}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="text-right">
      <div className="text-[9px] font-semibold uppercase tracking-widest text-[var(--t4)]">
        {label}
      </div>
      <Mono
        className="text-lg font-black leading-none"
        style={{ color: accent || "var(--t1)" }}
      >
        {value}
      </Mono>
    </div>
  );
}

function OppRow({ o }: { o: Opp }) {
  const a = o.arbitrage.arbitrage;
  const d = o.deal;
  return (
    <Link
      href={`/deal/${d.id}`}
      className="glass-panel flex items-center justify-between gap-3 p-3 transition-colors hover:border-[var(--amber)]"
      style={{ borderColor: "transparent" }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-[var(--t1)]">
          {d.year} {d.make} {d.model}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-[var(--t3)]">
          <span className="font-bold text-[var(--t2)]">
            {o.arbitrage.sourceState}
          </span>
          <Ico name="arrow" size={11} />
          <span>{o.arbitrage.targetRegion?.state}</span>
          <span className="text-[var(--t4)]">
            · ~{Math.round(a.distance)}mi · {money(a.transportCost)} haul
          </span>
        </div>
      </div>
      <div className="flex items-center gap-4 shrink-0">
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-[var(--t4)]">
            Buy → Sell
          </div>
          <div className="font-mono text-xs text-[var(--t3)]">
            {money(a.sourcePrice)} → {money(a.targetPrice)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-widest text-[var(--t4)]">
            Net import profit
          </div>
          <Mono
            className="text-base font-black"
            style={{ color: "var(--green)" }}
          >
            {money(a.potentialProfit)}
          </Mono>
          <div className="font-mono text-[10px] text-[var(--t4)]">
            {a.profitMargin}% margin
          </div>
        </div>
      </div>
    </Link>
  );
}

function LocalRow({ d }: { d: any }) {
  const profit = Number(d.true_net_profit ?? 0);
  return (
    <Link
      href={`/deal/${d.id}`}
      className="glass-panel flex items-center justify-between gap-3 p-3 transition-colors hover:border-[var(--amber)]"
      style={{ borderColor: "transparent" }}
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-[var(--t1)]">
          {d.year} {d.make} {d.model}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-[var(--t3)]">
          {d.locationState} · in your market · no transport
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-[9px] uppercase tracking-widest text-[var(--t4)]">
          Ask · est. resale
        </div>
        <div className="font-mono text-xs text-[var(--t3)]">
          {money(d.askPrice)} → {money(d.sellEstimate)}
        </div>
        {profit > 0 && (
          <Mono
            className="text-sm font-black"
            style={{ color: "var(--green)" }}
          >
            {money(profit)} net
          </Mono>
        )}
      </div>
    </Link>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-[var(--r3)] py-16 text-center"
      style={{ background: "var(--s1)" }}
    >
      <Ico name="map" size={26} className="text-[var(--t5)]" />
      <p className="text-sm font-bold text-[var(--t2)]">{text}</p>
    </div>
  );
}
