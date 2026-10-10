"use client";

import React from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  buildBuyerIntentQuery,
  buyerIntentLabel,
  useBuyerIntent,
} from "@/hooks/useBuyerIntent";
import { Mono } from "@/components/shared/Mono";
import { DealTicker } from "@/components/home/DealTicker";
import { MarketPulse } from "@/components/home/MarketPulse";
import { FlashRail } from "@/components/discovery/FlashRail";
import { IntelRail } from "@/components/discovery/IntelRail";
import { CalibrationNudge } from "@/components/deal/CalibrationNudge";
import { NextBestBuySpotlight } from "@/components/deal/NextBestBuySpotlight";
import { defaultScanSort } from "@/lib/buyer/scan-sort";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { todaySourceProofLabel } from "@/lib/discovery/count-labels";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/** The one cohesive front door: saved-inventory pulse, then everything worth acting on. */
function SystemPulse() {
  const { intent } = useBuyerIntent();
  // Profit sort is for reseller/dealer desks; everyone else (and unknown) sorts by score.
  const sort = defaultScanSort(intent?.buyerMode);
  const { data } = useSWR("/api/system/status", fetcher, {
    refreshInterval: 300_000,
  });
  const f = data?.freshness;
  const q = data?.quality;
  const l = data?.learning;
  if (!data) return null;
  const hasBuyDeals = (q?.goDeals ?? 0) > 0;

  const cells = [
    {
      label: "saved listings",
      value: (f?.activeDeals ?? 0).toLocaleString(),
      tone: "var(--t1)",
      href: `/scan?sort=${sort}`,
    },
    {
      label: hasBuyDeals ? "BUY now" : "watch now",
      value: hasBuyDeals
        ? (q?.goDeals ?? 0).toLocaleString()
        : (q?.watchCandidates ?? 0).toLocaleString(),
      tone: hasBuyDeals ? "var(--green)" : "var(--amber)",
      href: hasBuyDeals
        ? `/scan?verdict=go&sort=${sort}`
        : `/scan?verdict=watch&sort=${sort}`,
    },
    {
      label: "new today",
      value: (f?.newLast24h ?? 0).toLocaleString(),
      tone: "var(--amber)",
      href: `/scan?sort=${sort}`,
    },
    {
      label: f?.stale ? "saved data stale" : "saved data updated",
      value: f?.stale ? "Stale" : "Fresh",
      tone: f?.stale ? "var(--red)" : "var(--green)",
      href: "/scan?sort=newest",
    },
  ];

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          System pulse
        </p>
        <Link
          href="/scan?sort=newest"
          className="text-[11px] text-[var(--t4)] hover:text-[var(--t1)]"
        >
          details →
        </Link>
      </div>
      <div className="grid grid-cols-4 gap-3">
        {cells.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="rounded-[var(--r2)] border border-transparent p-2 -m-2 transition-colors hover:border-[var(--b1)] hover:bg-[var(--s1)]"
          >
            <Mono
              className="text-xl md:text-2xl font-black"
              style={{ fontFamily: "var(--fm)", color: c.tone }}
            >
              {c.value}
            </Mono>
            <p className="text-[10px] text-[var(--t4)] font-semibold mt-0.5">
              {c.label}
            </p>
          </Link>
        ))}
      </div>
      {l?.prioritizedMakes?.length > 0 && (
        <p className="text-[11px] text-[var(--t4)] mt-3">
          Learning from your wins — prioritizing{" "}
          <span className="text-[var(--green)] font-semibold capitalize">
            {l.prioritizedMakes.slice(0, 4).join(", ")}
          </span>
          .
        </p>
      )}
    </div>
  );
}

function BuyerIntentToday() {
  const { intent } = useBuyerIntent();
  const params = buildBuyerIntentQuery(intent);
  const query = params.toString();
  const label = buyerIntentLabel(intent);
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
  const scanHref = `/scan?${query ? `${query}&` : ""}sort=${defaultScanSort(intent?.buyerMode)}`;
  const { data, isLoading } = useSWR(
    `/api/scrape/health${query ? `?${query}` : ""}`,
    fetcher,
    { refreshInterval: 300_000, revalidateOnFocus: false },
  );

  const sources = Array.isArray(data?.sources) ? data.sources : [];
  const ready = sources.filter((source: any) => source.readiness === "ready");
  const action = sources.filter((source: any) =>
    ["needs_login", "blocked", "needs_run", "no_rows"].includes(
      source.readiness,
    ),
  );
  const rows = ready.reduce(
    (sum: number, source: any) => sum + (Number(source.activeRows) || 0),
    0,
  );
  const photos = ready.reduce(
    (sum: number, source: any) => sum + (Number(source.rowsWithPhotos) || 0),
    0,
  );
  const quality = ready.length
    ? Math.round(
        ready.reduce(
          (sum: number, source: any) =>
            sum + (Number(source.averageQuality) || 0),
          0,
        ) / ready.length,
      )
    : 0;
  const weakFields = [
    {
      label: "VIN",
      value: ready.length
        ? Math.round(
            ready.reduce(
              (sum: number, source: any) =>
                sum + (Number(source.completeness?.vinPct) || 0),
              0,
            ) / ready.length,
          )
        : 0,
    },
    {
      label: "Mileage",
      value: ready.length
        ? Math.round(
            ready.reduce(
              (sum: number, source: any) =>
                sum + (Number(source.completeness?.mileagePct) || 0),
              0,
            ) / ready.length,
          )
        : 0,
    },
    {
      label: "Contact",
      value: ready.length
        ? Math.round(
            ready.reduce(
              (sum: number, source: any) =>
                sum + (Number(source.completeness?.sellerContactPct) || 0),
              0,
            ) / ready.length,
          )
        : 0,
    },
  ]
    .filter((item) => item.value < 70)
    .slice(0, 2);

  return (
    <div className="glass-panel p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
            Today for your buyer intent
          </p>
          <h2 className="mt-1 text-xl font-black text-[var(--t1)]">
            {intent ? label : "Set a buyer intent to make Today personal."}
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
            {isLoading
              ? "Checking matching source proof..."
              : ready.length
                ? todaySourceProofLabel({
                    readySources: ready.length,
                    rows,
                    photos,
                    quality,
                  })
                : action.length
                  ? `We need a broader search before we can recommend vehicles for this exact scope.`
                  : "No matching vehicles are ready to review yet. Start from Discover to choose a lane, state, budget, seller type, and watched dealers."}
            {weakFields.length
              ? ` Verify before ${flipDesk ? "bidding" : "buying"}: ${weakFields
                  .map((item) => `${item.label.toLowerCase()} ${item.value}%`)
                  .join(", ")}.`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={scanHref}
            className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
          >
            Open today&apos;s matches
          </Link>
          <Link
            href="/discover"
            className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
          >
            Edit intent
          </Link>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
          <div className="text-lg font-black text-[var(--green)]">
            {ready.length}
          </div>
          <div className="text-[10px] font-black uppercase text-[var(--t5)]">
            ready
          </div>
        </div>
        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
          <div className="text-lg font-black text-[var(--t1)]">
            {rows.toLocaleString()}
          </div>
          <div className="text-[10px] font-black uppercase text-[var(--t5)]">
            rows
          </div>
        </div>
        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
          <div className="text-lg font-black text-[var(--t1)]">
            {photos.toLocaleString()}
          </div>
          <div className="text-[10px] font-black uppercase text-[var(--t5)]">
            photos
          </div>
        </div>
        <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
          <div className="text-lg font-black text-[var(--amber-d)]">
            {action.length}
          </div>
          <div className="text-[10px] font-black uppercase text-[var(--t5)]">
            action
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TodayPage() {
  const { intent } = useBuyerIntent();
  // Flip-economics widgets (highest-margin spotlight, avg profit by model,
  // "deals like your winners") are for reseller/dealer desks only. Unknown = personal.
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
  // Scope the peer-mispricing rail to the saved home state (like Discover) so an MO buyer is not
  // shown an NJ listing. Wait for prefs so the first fetch is not an unscoped nationwide one.
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const homeState = effectiveHome(prefs)?.state || "";
  const mispricingEndpoint = `/api/mispricing${homeState ? `?state=${encodeURIComponent(homeState)}` : ""}`;
  return (
    <div
      className="max-w-6xl mx-auto px-4 py-6 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">Today</h1>
        <p className="text-[var(--t3)] text-sm">
          Your market, sourced and scored automatically. Here&apos;s what to act
          on.
        </p>
      </div>

      <DealTicker />
      <BuyerIntentToday />
      <SystemPulse />
      {flipDesk && <NextBestBuySpotlight />}
      {/* Sold-flip calibration is a flip-desk upsell; personal/DIY/parts never see it. */}
      {flipDesk && <CalibrationNudge />}
      {flipDesk && <MarketPulse />}

      {/* Everything worth acting on — each rail self-fetches and hides when empty */}
      <FlashRail />
      {flipDesk && (
        <IntelRail
          endpoint="/api/recommendations"
          title="🏆 Deals like your winners"
          subtitle="Matched to the make/models you've actually profited on"
        />
      )}
      <IntelRail
        endpoint="/api/deals/near"
        title={flipDesk ? "📍 Near you" : "Listings in your home state"}
        subtitle={
          flipDesk
            ? "Closest BUY deals to your home base"
            : "Listings in the state you live in"
        }
      />
      {!prefsLoading && (
        <IntelRail
          endpoint={mispricingEndpoint}
          title="Underpriced vs peers"
          subtitle={
            homeState
              ? `Priced well under similar listings in ${homeState}`
              : "Statistical outliers priced well under their cluster"
          }
        />
      )}

      <div className="glass-panel p-5 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-[var(--t1)]">
            Want the full grid?
          </p>
          <p className="text-xs text-[var(--t4)]">
            Search, filter, and scan every saved listing.
          </p>
        </div>
        <Link
          href="/scan"
          className="px-4 py-2 rounded-[var(--r3)] font-bold text-white text-sm shrink-0"
          style={{ background: "var(--grad)" }}
        >
          Open Scan →
        </Link>
      </div>
    </div>
  );
}
