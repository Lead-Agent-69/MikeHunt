"use client";

import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useDealerWatch } from "@/hooks/useDealerWatch";

// A single dealer's storefront inside our app: their live inventory, each with the ACCURATE title status +
// our resale estimate + BUY/HOLD/PASS verdict, newest listings first. This is the payoff of watching a shop.

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n?: number | null) =>
  n != null ? `$${Math.round(n).toLocaleString()}` : "—";

// Accurate per-car title label — never guessed; straight from the scraped `condition`.
const TITLE_META: Record<string, { label: string; color: string }> = {
  clean_title: { label: "Clean title", color: "var(--green)" },
  clean: { label: "Clean title", color: "var(--green)" },
  rebuilt_title: { label: "Rebuilt", color: "var(--amber)" },
  repairable: { label: "Repairable", color: "var(--amber)" },
  run_drive: { label: "Runs & drives", color: "var(--amber)" },
  salvage_title: { label: "Salvage", color: "var(--red)" },
  parts_only: { label: "Parts only", color: "var(--t4)" },
  flood: { label: "Flood", color: "var(--blue)" },
  fire: { label: "Fire damage", color: "var(--red)" },
  hail: { label: "Hail", color: "var(--amber)" },
};

const VERDICT_COLOR: Record<string, string> = {
  go: "var(--green)",
  buy: "var(--green)",
  hold: "var(--amber)",
  pass: "var(--red)",
};

const isNew = (d?: string) =>
  d ? Date.now() - new Date(d).getTime() < 3 * 24 * 3600 * 1000 : false;

export default function DealerStorefront({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = use(params);
  const { data: net } = useSWR<{ dealers: any[] }>(
    "/api/dealer-network",
    fetcher,
    { revalidateOnFocus: false },
  );
  const dealer = net?.dealers?.find((d) => d.host === host);
  const { data: carsData, isLoading } = useSWR(
    `/api/scan?dealer=${encodeURIComponent(host)}&limit=300`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const watch = useDealerWatch();
  const on = watch.has(host);

  const cars = ((carsData?.vehicles || carsData?.deals || []) as any[])
    .slice()
    .sort(
      (a, b) =>
        new Date(b.firstSeenAt || 0).getTime() -
        new Date(a.firstSeenAt || 0).getTime(),
    );

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <Link
        href="/dealer-network"
        className="text-xs font-bold text-[var(--t4)] hover:text-[var(--t2)]"
      >
        ← Dealer network
      </Link>

      {/* Dealer header */}
      <div className="glass-panel p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg md:text-xl font-black text-[var(--t1)] truncate">
              {dealer?.name || host}
            </h1>
            {dealer && (
              <span
                className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                style={{
                  color: dealer.accent,
                  border: `1px solid ${dealer.accent}`,
                }}
              >
                {dealer.typeLabel}
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--t4)] mt-0.5">
            {cars.length.toLocaleString()} live vehicles
            {dealer?.state ? ` · ${dealer.state}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => watch.toggle(host)}
            className="px-3 py-2 rounded-xl text-sm font-bold border transition-colors"
            style={{
              background: on ? "var(--amber)" : "var(--s0)",
              color: on ? "#000" : "var(--t3)",
              borderColor: on ? "var(--amber)" : "var(--b1)",
            }}
          >
            {on ? "★ Watching" : "☆ Watch"}
          </button>
          <a
            href={dealer?.url || `https://${host}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 rounded-xl text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Visit site ↗
          </a>
        </div>
      </div>

      {/* Inventory */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="glass-panel h-64 shimmer" />
          ))}
        </div>
      ) : cars.length === 0 ? (
        <div className="glass-panel p-10 text-center text-sm text-[var(--t4)]">
          No live inventory synced from this dealer right now.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((c) => {
            const t = TITLE_META[c.condition] || null;
            const verdict = (c.dealVerdict || "").toLowerCase();
            const img =
              Array.isArray(c.images) && c.images[0]?.startsWith?.("http")
                ? c.images[0]
                : null;
            return (
              <Link
                key={c.id}
                href={`/deal/${c.id}`}
                className="glass-panel overflow-hidden flex flex-col hover:border-[var(--amber-bd)] transition-colors"
                style={{ padding: 0 }}
              >
                <div className="relative aspect-[4/3] bg-[var(--s2)] grid place-items-center">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={img}
                      alt={c.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-2xl opacity-30">🚗</span>
                  )}
                  {isNew(c.firstSeenAt) && (
                    <span className="absolute top-2 left-2 text-[10px] font-black px-1.5 py-0.5 rounded text-black bg-[var(--amber)]">
                      NEW
                    </span>
                  )}
                  {t && (
                    <span
                      className="absolute bottom-2 left-2 text-[10px] font-black px-1.5 py-0.5 rounded text-white"
                      style={{ background: t.color }}
                    >
                      {t.label}
                    </span>
                  )}
                </div>
                <div className="p-3 flex flex-col gap-1">
                  <div className="text-sm font-bold text-[var(--t1)] truncate">
                    {[c.year, c.make, c.model].filter(Boolean).join(" ")}
                  </div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-base font-black text-[var(--t1)]">
                      {money(c.askPrice)}
                    </span>
                    {c.sellEstimate != null && (
                      <span className="text-[11px] text-[var(--t4)]">
                        resale ~{money(c.sellEstimate)}
                      </span>
                    )}
                  </div>
                  {(verdict || c.true_net_profit != null) && (
                    <div className="flex items-center gap-2 text-[11px] font-bold">
                      {verdict && (
                        <span
                          style={{
                            color: VERDICT_COLOR[verdict] || "var(--t3)",
                          }}
                        >
                          {verdict === "go" ? "BUY" : verdict.toUpperCase()}
                        </span>
                      )}
                      {c.true_net_profit != null && (
                        <span
                          style={{
                            color:
                              c.true_net_profit > 0
                                ? "var(--green)"
                                : "var(--t4)",
                          }}
                        >
                          {c.true_net_profit > 0 ? "+" : ""}
                          {money(c.true_net_profit)} net
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
