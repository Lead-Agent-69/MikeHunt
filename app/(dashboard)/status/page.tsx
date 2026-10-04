"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { scanHrefForSource } from "@/lib/sources/source-lanes";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const ago = (iso?: string | null) => {
  if (!iso) return "never";
  const h = Math.round((Date.now() - new Date(iso).getTime()) / 3600_000);
  if (h < 1) return "just now";
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
};

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: any;
  tone?: string;
}) {
  return (
    <div className="glass-panel p-4">
      <Mono
        className="text-2xl font-black"
        style={{ fontFamily: "var(--fm)", color: tone || "var(--t1)" }}
      >
        {value}
      </Mono>
      <p className="text-[11px] text-[var(--t4)] font-semibold mt-1">{label}</p>
    </div>
  );
}

function Bar({ label, pct }: { label: string; pct: number }) {
  const tone =
    pct >= 70 ? "var(--green)" : pct >= 35 ? "var(--amber)" : "var(--red)";
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-[var(--t3)]">{label}</span>
        <Mono style={{ fontFamily: "var(--fm)", color: tone }}>{pct}%</Mono>
      </div>
      <div className="h-2 rounded-full" style={{ background: "var(--s3)" }}>
        <div
          className="h-2 rounded-full transition-all"
          style={{ width: `${Math.max(2, pct)}%`, background: tone }}
        />
      </div>
    </div>
  );
}

const READINESS_LABELS: Record<string, string> = {
  ready: "Ready",
  needs_login: "Needs login",
  blocked: "Blocked",
  no_rows: "No rows",
  needs_run: "Needs run",
  not_configured: "Setup needed",
  disabled: "Disabled",
};

function readinessTone(status: string) {
  if (status === "ready") return "var(--green)";
  if (status === "no_rows" || status === "needs_run") return "var(--amber)";
  if (status === "needs_login" || status === "blocked") return "var(--red)";
  return "var(--t5)";
}

export default function StatusPage() {
  const { data } = useSWR("/api/system/status", fetcher, {
    refreshInterval: 180_000,
  });
  const { data: sourceHealth } = useSWR("/api/scrape/health", fetcher, {
    refreshInterval: 180_000,
  });
  const f = data?.freshness;
  const q = data?.quality;
  const l = data?.learning;
  const sources: any[] = data?.sources ?? [];
  const healthSources: any[] = sourceHealth?.sources ?? [];
  const runs: any[] = data?.recentRuns ?? [];
  const breakdown: any[] = data?.sourceBreakdown ?? [];
  const kb = data?.knowledgeBase;
  const acc = data?.valuationAccuracy;
  const readiness = data?.readiness;
  const realData = data?.realData;
  const missingReadinessItems: any[] =
    readiness?.items?.filter((item: any) => item.status !== "ready") ?? [];
  const nextReadinessItem = missingReadinessItems[0];
  const missingEnv: string[] = readiness?.missingEnv ?? [];
  const readySources = healthSources.filter((s) => s.readiness === "ready");
  const loginSources = healthSources.filter(
    (s) => s.readiness === "needs_login",
  );
  const blockedSources = healthSources.filter((s) => s.readiness === "blocked");
  const publicRows = healthSources.reduce(
    (sum, s) => sum + (Number(s.activeRows) || 0),
    0,
  );
  const photoRows = healthSources.reduce(
    (sum, s) => sum + (Number(s.rowsWithPhotos) || 0),
    0,
  );
  const healthSummary = sourceHealth?.summary || {};
  const readySourceCount = Number(
    healthSummary.ready ?? healthSummary.healthy ?? readySources.length,
  );
  const loginSourceCount = Number(
    healthSummary.needsLogin ?? loginSources.length,
  );
  const blockedSourceCount = Number(
    healthSummary.blocked ?? blockedSources.length,
  );
  const proofRows = Number(healthSummary.activeRows ?? publicRows);
  const proofPhotoRows = Number(healthSummary.rowsWithPhotos ?? photoRows);
  const proofAverageQuality = Number(healthSummary.averageQuality ?? 0);
  const bestPublicSource = readySources
    .slice()
    .sort((a, b) => (b.activeRows || 0) - (a.activeRows || 0))[0];
  const bestReadyScanHref = bestPublicSource
    ? scanHrefForSource(bestPublicSource)
    : "/scan";
  const launchQueue = [
    {
      title: "1. Keep public preview useful",
      done: readySourceCount > 0,
      detail: readySourceCount
        ? `${readySourceCount} public source${readySourceCount === 1 ? "" : "s"} can show cars now. Use these while database setup is pending.`
        : "No public source is returning usable vehicles yet.",
      href: bestReadyScanHref,
      action: "Open ready scan",
    },
    {
      title: "2. Connect persistence",
      done: Boolean(
        readiness?.items?.find((item: any) => item.id === "supabase")
          ?.status === "ready",
      ),
      detail:
        "Supabase public keys turn preview rows into saved inventory, synced watchlists, source history, and real user preferences.",
      href: "/status",
      action: "Review env keys",
    },
    {
      title: "3. Enable scoped source searches",
      done: Boolean(
        readiness?.items?.find((item: any) => item.id === "scrape-control")
          ?.status === "ready",
      ),
      detail:
        "Once scraper control is authorized, Scan can run only the buyer-selected lane/source instead of broad scraping.",
      href: "/scan",
      action: "Open Scan",
    },
    {
      title: "4. Add protected-source access",
      done: loginSourceCount === 0,
      detail: loginSourceCount
        ? `${loginSourceCount} source${loginSourceCount === 1 ? "" : "s"} still need credentials, dealer access, proxy, or captcha strategy.`
        : "No credential-gated source is currently blocking the proof matrix.",
      href: "/sources?filter=login",
      action: "Credential queue",
    },
  ];
  const sortedHealthSources = healthSources.slice().sort((a, b) => {
    const rank: Record<string, number> = {
      ready: 0,
      no_rows: 1,
      needs_run: 2,
      needs_login: 3,
      blocked: 4,
      not_configured: 5,
      disabled: 6,
    };
    const ar = rank[a.readiness] ?? 9;
    const br = rank[b.readiness] ?? 9;
    if (ar !== br) return ar - br;
    return (b.activeRows || 0) - (a.activeRows || 0);
  });
  const buyerQuestions = [
    {
      question: "What cars should I look at today?",
      status:
        readySourceCount > 0 && (f?.activeDeals ?? 0) > 0
          ? "working"
          : "needs work",
      proof:
        readySourceCount > 0
          ? `${(f?.activeDeals ?? 0).toLocaleString()} active rows with ${readySourceCount} ready source${readySourceCount === 1 ? "" : "s"}.`
          : "No ready source has inventory proof yet.",
      href: bestReadyScanHref,
      action: "Open Scan",
    },
    {
      question: "Can I trust this data?",
      status:
        (q?.imagePct ?? 0) >= 70 &&
        (q?.sourceLinkPct ?? 0) >= 70 &&
        f?.stale === false
          ? "working"
          : "thin",
      proof: `${q?.imagePct ?? 0}% photos, ${q?.sourceLinkPct ?? 0}% source links, ${f?.stale ? "stale" : "fresh"} inventory.`,
      href: "/sources",
      action: "Source proof",
    },
    {
      question: "Where did this vehicle come from?",
      status: (q?.sourceLinkPct ?? 0) >= 70 ? "working" : "thin",
      proof: `${q?.sourceLinkPct ?? 0}% of active rows include a source link.`,
      href: "/sources",
      action: "Trace sources",
    },
    {
      question: "Is it profitable after costs?",
      status: (kb?.dealMathReadyPct ?? 0) >= 70 ? "working" : "thin",
      proof: `${kb?.dealMathReadyPct ?? 0}% have resale math and net-profit scoring.`,
      href: "/scan?sort=profit",
      action: "Sort by profit",
    },
    {
      question: "Can I narrow to state, budget, vehicle, title, and seller?",
      status: "working",
      proof:
        "Scan, onboarding, and source health accept lane, state, keyword, budget, title, and dealer scope.",
      href: "/scan",
      action: "Set scope",
    },
    {
      question: "Can I save/watch and get alerted?",
      status:
        readiness?.items?.find((item: any) => item.id === "google-login")
          ?.status === "ready"
          ? "working"
          : "setup",
      proof:
        readiness?.items?.find((item: any) => item.id === "google-login")
          ?.status === "ready"
          ? "Google login is ready for synced watchlists."
          : "Watch flows exist, but Google OAuth still needs provider credentials.",
      href: "/login",
      action: "Check login",
    },
  ];
  const adoptionScore = buyerQuestions.length
    ? Math.round(
        (buyerQuestions.filter((item) => item.status === "working").length /
          buyerQuestions.length) *
          100,
      )
    : 0;
  const detailBars = [
    ["Has photos", q?.imagePct ?? 0],
    ["Has source link", q?.sourceLinkPct ?? 0],
    ["Has price", q?.pricePct ?? 0],
    ["Has damage/condition", q?.damagePct ?? 0],
    ["Has title type", q?.titlePct ?? 0],
    ["Has mileage", q?.mileagePct ?? 0],
    ["Has seller/source proof", q?.sellerPct ?? 0],
    ["Has direct contact", q?.sellerContactPct ?? 0],
    ["Has auction date", q?.auctionDatePct ?? 0],
    ["Has VIN", q?.vinPct ?? 0],
  ] as const;
  const trulyWorking = [
    realData?.status === "ready"
      ? `${(realData?.activeDeals ?? 0).toLocaleString()} fresh rows with source proof, photos, prices, and title/condition labels.`
      : `${(f?.activeDeals ?? 0).toLocaleString()} active rows exist, but the real-data trust pass still needs stronger coverage before this feels premium.`,
    `${readySourceCount} ready source${readySourceCount === 1 ? "" : "s"} can show inventory now, including public auctions and dealer inventory.`,
    "Scoped source searches are enabled, so Scan can use only the buyer's lane, state, budget, title type, keyword, and watched dealers.",
    "Deal math is available on current rows, so users can sort by profit/watch candidates instead of browsing raw scrape output.",
  ];
  const notDone = [
    {
      title: "Google account creation is not fully proven",
      detail:
        "The app-side OAuth flow exists, but Supabase still needs the Google provider and callback verification before real users can sign in and sync saved searches.",
      href: "/login",
      action: "Test login",
    },
    {
      title:
        readiness?.items?.find((item: any) => item.id === "ai-provider")
          ?.status === "ready"
          ? "AI briefs stay narrate-only"
          : "AI briefs are not provider-backed yet",
      detail:
        readiness?.items?.find((item: any) => item.id === "ai-provider")
          ?.status === "ready"
          ? "A provider key is set. Briefs may explain fetched deals in words. Prices, MMR, and market value still come only from fetched data, never from the model."
          : "Deterministic deal briefs and market pulse use saved buyer math and live deal data. Narration prefers ANTHROPIC_API_KEY (Haiku). OPENAI_API_KEY and GOOGLE_GENERATIVE_AI_API_KEY are optional fallbacks, and the model must not invent prices.",
      href: "/status",
      action: "Provider checklist",
    },
    {
      title: "Contact, auction date, VIN, and mileage are too thin",
      detail: `${q?.sellerContactPct ?? 0}% direct contact, ${q?.auctionDatePct ?? 0}% auction date, ${q?.vinPct ?? 0}% VIN, and ${q?.mileagePct ?? 0}% mileage coverage. Buyers can discover deals, but must verify weak fields before acting.`,
      href: "/sources",
      action: "Source proof",
    },
    {
      title: "Gated auction sources need real access",
      detail: `${loginSourceCount} source${loginSourceCount === 1 ? "" : "s"} need credentials, dealer license access, proxy/captcha handling, or official API access before users should expect those rows.`,
      href: "/sources?filter=login",
      action: "Credential queue",
    },
  ];
  const nextUpgradeLanes = [
    {
      title: "Preference-first search",
      detail:
        "Make every import start from user intent: state, lane, vehicle type, title type, budget, distance, and watched sellers. This protects Supabase from noise and makes results feel personal.",
      level: "P0",
    },
    {
      title: "Trust receipt on every car",
      detail:
        "Show source, run time, fields verified, fields missing, photo count, seller proof, and a one-tap original listing link on every result.",
      level: "P0",
    },
    {
      title: "Market-backed buy/pass",
      detail:
        "Add sold comps and third-party values so profit scoring moves from estimated math to evidence-backed recommendations.",
      level: "P1",
    },
    {
      title: "Concierge recovery flow",
      detail:
        "When a source is empty, blocked, or thin, tell users exactly how to broaden scope, add a seller, connect credentials, or watch for the next run.",
      level: "P1",
    },
  ];
  const operatingOrder = [
    {
      title: readySourceCount
        ? `Work the ${readySourceCount} ready source${readySourceCount === 1 ? "" : "s"} first`
        : "Get one source to ready",
      why: readySourceCount
        ? `${proofRows.toLocaleString()} scoped rows are available now. Start with proven sources instead of broad scraping.`
        : "A buyer cannot adopt the app until at least one source reliably returns fresh vehicles.",
      href: bestReadyScanHref,
      action: readySourceCount ? "Open ready scan" : "Source proof",
      state: readySourceCount ? "ready" : "blocked",
    },
    {
      title:
        (q?.vinPct ?? 0) >= 50 && (q?.mileagePct ?? 0) >= 50
          ? "Promote proof-rich deals"
          : "Enrich thin vehicle details",
      why: `${q?.vinPct ?? 0}% VIN and ${q?.mileagePct ?? 0}% mileage coverage. Prioritize detail APIs, VIN decode, title type, and auction dates before adding more noisy rows.`,
      href: "/scan?sort=score",
      action: "Review proof-ranked",
      state:
        (q?.vinPct ?? 0) >= 50 && (q?.mileagePct ?? 0) >= 50 ? "ready" : "thin",
    },
    {
      title:
        readiness?.items?.find((item: any) => item.id === "google-login")
          ?.status === "ready"
          ? "Account sync is ready"
          : "Finish Google account sync",
      why:
        readiness?.items?.find((item: any) => item.id === "google-login")
          ?.status === "ready"
          ? "Users can sign in, save, and sync watch intent across sessions."
          : "Without provider-verified OAuth, saved searches and alerts feel temporary instead of account-backed.",
      href: "/login",
      action: "Check login",
      state:
        readiness?.items?.find((item: any) => item.id === "google-login")
          ?.status === "ready"
          ? "ready"
          : "setup",
    },
    {
      title:
        readiness?.items?.find((item: any) => item.id === "ai-provider")
          ?.status === "ready"
          ? "Turn on AI briefs"
          : "Connect AI before promising a co-pilot",
      why:
        readiness?.items?.find((item: any) => item.id === "ai-provider")
          ?.status === "ready"
          ? "Haiku (or the configured narrate fallback) can summarize why a deal is shown. It does not invent prices."
          : "The app can rank and explain from live data now. Narration prefers an Anthropic Haiku key; OpenAI and Gemini are optional fallbacks.",
      href: "/status",
      action: "Provider checklist",
      state:
        readiness?.items?.find((item: any) => item.id === "ai-provider")
          ?.status === "ready"
          ? "ready"
          : "setup",
    },
  ];

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          System Status
        </h1>
        <p className="text-[var(--t3)] text-sm">
          The pipeline watches itself — freshness, source health, and data
          quality.
        </p>
      </div>

      {!data ? (
        <div className="glass-panel p-8 text-center text-[var(--t4)] text-sm">
          Loading…
        </div>
      ) : (
        <>
          <div className="glass-panel p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                  Visionary but realistic readout
                </p>
                <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                  The app works as a live inventory scout, but not yet as a
                  fully trusted buyer co-pilot.
                </h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
                  A serious buyer expects three things: exact-fit inventory,
                  proof they can trust, and a clean path to act. The current
                  system is strongest on live discovery and scoped source
                  searches; the remaining adoption work is account sync, AI
                  analysis, source-access expansion, and deeper per-vehicle
                  evidence.
                </p>
              </div>
              <Link
                href="/scan"
                className="inline-flex w-fit rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
              >
                Open buyer scan
              </Link>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
              <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--green)]">
                  Working now
                </div>
                <div className="mt-3 space-y-2">
                  {trulyWorking.map((item) => (
                    <p
                      key={item}
                      className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2 text-xs leading-relaxed text-[var(--t3)]"
                    >
                      {item}
                    </p>
                  ))}
                </div>
              </div>

              <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--amber-d)]">
                  Not done yet
                </div>
                <div className="mt-3 space-y-2">
                  {notDone.map((item) => (
                    <div
                      key={item.title}
                      className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="text-xs font-black text-[var(--t1)]">
                          {item.title}
                        </h3>
                        <Link
                          href={item.href}
                          className="shrink-0 rounded-[var(--r1)] border border-[var(--b2)] px-2 py-1 text-[10px] font-black text-[var(--t2)]"
                        >
                          {item.action}
                        </Link>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                        {item.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              {nextUpgradeLanes.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-black text-[var(--t1)]">
                      {item.title}
                    </h3>
                    <span className="rounded-full border border-[var(--b2)] px-2 py-0.5 text-[10px] font-black text-[var(--t4)]">
                      {item.level}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                    Today&apos;s operating order
                  </div>
                  <h3 className="mt-1 text-sm font-black text-[var(--t1)]">
                    Do these in order so the app feels adopted, not just built.
                  </h3>
                </div>
                <Link
                  href="/scan?sort=score"
                  className="inline-flex w-fit rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                >
                  Proof-ranked scan
                </Link>
              </div>
              <div className="mt-3 grid gap-2 lg:grid-cols-4">
                {operatingOrder.map((item, index) => {
                  const tone =
                    item.state === "ready"
                      ? "var(--green)"
                      : item.state === "blocked"
                        ? "var(--red)"
                        : "var(--amber)";
                  return (
                    <div
                      key={item.title}
                      className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--s1)] text-[11px] font-black text-[var(--t3)]">
                          {index + 1}
                        </span>
                        <span
                          className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                          style={{
                            color: tone,
                            border: `1px solid ${tone}55`,
                            background: `${tone}12`,
                          }}
                        >
                          {item.state}
                        </span>
                      </div>
                      <h4 className="mt-3 text-sm font-black leading-tight text-[var(--t1)]">
                        {item.title}
                      </h4>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                        {item.why}
                      </p>
                      <Link
                        href={item.href}
                        className="mt-3 inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s1)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                      >
                        {item.action}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {realData && (
            <div className="glass-panel p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                    Real inventory verdict
                  </p>
                  <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                    {realData.label}
                  </h2>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
                    {realData.message}
                  </p>
                </div>
                <span
                  className="w-fit rounded-full px-3 py-1 text-xs font-black uppercase"
                  style={{
                    background:
                      realData.status === "ready"
                        ? "var(--glo)"
                        : realData.status === "stale"
                          ? "var(--amber-lo)"
                          : realData.status === "thin"
                            ? "var(--amber-lo)"
                            : "var(--red-lo)",
                    color:
                      realData.status === "ready"
                        ? "var(--green)"
                        : realData.status === "empty"
                          ? "var(--red)"
                          : "var(--amber-d)",
                  }}
                >
                  {String(realData.status).replace(/_/g, " ")}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
                <Stat
                  label="Real active rows"
                  value={(realData.activeDeals ?? 0).toLocaleString()}
                  tone={realData.activeDeals ? "var(--green)" : "var(--red)"}
                />
                <Stat
                  label="Newest listing"
                  value={
                    realData.newestAgeHours == null
                      ? "unknown"
                      : realData.newestAgeHours < 1
                        ? "<1h"
                        : `${realData.newestAgeHours}h`
                  }
                  tone={
                    realData.status === "stale" ? "var(--red)" : "var(--green)"
                  }
                />
                <Stat
                  label="New rows 24h"
                  value={(realData.newLast24h ?? 0).toLocaleString()}
                  tone={realData.newLast24h ? "var(--green)" : "var(--amber)"}
                />
                <Stat
                  label="Browse-ready"
                  value={realData.buyerReady ? "YES" : "NO"}
                  tone={realData.buyerReady ? "var(--green)" : "var(--amber)"}
                />
                <Stat
                  label="Purchase-ready"
                  value={realData.decisionReady ? "YES" : "NOT YET"}
                  tone={
                    realData.decisionReady ? "var(--green)" : "var(--amber)"
                  }
                />
              </div>

              <div className="mt-4 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
                <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                  Next best action
                </div>
                <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--t2)]">
                  {realData.nextAction}
                </p>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {Object.entries(realData.proof || {}).map(([key, value]) => {
                  const labels: Record<string, string> = {
                    photoPct: "Photos",
                    sourceLinkPct: "Original links",
                    pricePct: "Prices",
                    titlePct: "Title type",
                    damagePct: "Condition/damage",
                    mileagePct: "Mileage",
                    vinPct: "VIN",
                    sellerPct: "Seller/source proof",
                    sellerContactPct: "Direct contact",
                    auctionDatePct: "Auction date",
                  };
                  return (
                    <Bar
                      key={key}
                      label={labels[key] || key}
                      pct={Number(value) || 0}
                    />
                  );
                })}
              </div>

              {Array.isArray(realData.gaps) && realData.gaps.length > 0 && (
                <div className="mt-4 grid gap-2 md:grid-cols-2">
                  {realData.gaps.slice(0, 4).map((gap: any) => (
                    <div
                      key={gap.field}
                      className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-black text-[var(--t1)]">
                          {gap.field}
                        </h3>
                        <Mono
                          className="text-xs font-black text-[var(--amber-d)]"
                          style={{ fontFamily: "var(--fm)" }}
                        >
                          {gap.pct}% / {gap.target}%
                        </Mono>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                        {gap.impact}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {readiness && (
            <div className="glass-panel p-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                    Real data readiness
                  </p>
                  <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                    {readiness.ready
                      ? "Core providers are configured."
                      : "Some production providers still need setup."}
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                    This is the checklist behind live inventory, Google login,
                    scraper imports, AI briefs, and source proof.
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs font-black"
                  style={{
                    background: readiness.ready
                      ? "var(--glo)"
                      : "var(--amber-lo)",
                    color: readiness.ready ? "var(--green)" : "var(--amber-d)",
                  }}
                >
                  {readiness.ready ? "READY" : "ACTION NEEDED"}
                </span>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <Stat
                  label="Launch gates ready"
                  value={`${readiness.summary?.readyCount ?? 0}/${readiness.summary?.total ?? readiness.items?.length ?? 0}`}
                  tone={readiness.ready ? "var(--green)" : "var(--amber)"}
                />
                <Stat
                  label="Env blockers"
                  value={readiness.summary?.envBlockers ?? 0}
                  tone={
                    readiness.summary?.envBlockers
                      ? "var(--red)"
                      : "var(--green)"
                  }
                />
                <Stat
                  label="Dashboard blockers"
                  value={readiness.summary?.providerDashboardBlockers ?? 0}
                  tone={
                    readiness.summary?.providerDashboardBlockers
                      ? "var(--amber)"
                      : "var(--green)"
                  }
                />
                <Stat
                  label="Verification blockers"
                  value={readiness.summary?.verificationBlockers ?? 0}
                  tone={
                    readiness.summary?.verificationBlockers
                      ? "var(--amber)"
                      : "var(--green)"
                  }
                />
              </div>

              {!readiness.ready && (
                <div className="mt-4 rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--amber-d)]">
                        Next production unblocker
                      </div>
                      <h3 className="mt-1 text-sm font-black text-[var(--t1)]">
                        {nextReadinessItem?.label || "Provider setup"}
                      </h3>
                      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-[var(--t3)]">
                        {nextReadinessItem?.nextStep ||
                          "Complete the missing provider setup, restart the app, then verify this page."}
                      </p>
                    </div>
                    <div className="shrink-0 text-left lg:text-right">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                        Missing env
                      </div>
                      <div className="mt-1 flex max-w-md flex-wrap gap-1.5 lg:justify-end">
                        {missingEnv.length ? (
                          missingEnv.slice(0, 6).map((key) => (
                            <code
                              key={key}
                              className="rounded-[var(--r1)] border border-[var(--amber-bd)] bg-[var(--s0)] px-2 py-1 text-[10px] font-black text-[var(--amber-d)]"
                            >
                              {key}
                            </code>
                          ))
                        ) : (
                          <span className="text-xs font-semibold text-[var(--t4)]">
                            Provider dashboard setup still needs verification.
                          </span>
                        )}
                        {missingEnv.length > 6 && (
                          <span className="rounded-[var(--r1)] border border-[var(--amber-bd)] bg-[var(--s0)] px-2 py-1 text-[10px] font-black text-[var(--amber-d)]">
                            +{missingEnv.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {nextReadinessItem?.setupUrl && (
                      <a
                        href={nextReadinessItem.setupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-1.5 text-xs font-black text-[var(--s0)]"
                      >
                        {nextReadinessItem.actionLabel || "Open setup"}
                      </a>
                    )}
                    {nextReadinessItem?.verifyPath && (
                      <Link
                        href={nextReadinessItem.verifyPath}
                        className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--amber-d)]"
                      >
                        Verify after restart
                      </Link>
                    )}
                  </div>
                </div>
              )}

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {readiness.items?.map((item: any) => {
                  const tone =
                    item.status === "ready"
                      ? "var(--green)"
                      : item.status === "partial"
                        ? "var(--amber)"
                        : "var(--red)";
                  return (
                    <div
                      key={item.id}
                      className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-[var(--t1)]">
                          {item.label}
                        </div>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {item.blockerType && item.blockerType !== "none" && (
                            <span className="rounded-full border border-[var(--b1)] bg-[var(--s0)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--t4)]">
                              {String(item.blockerType).replace(/_/g, " ")}
                            </span>
                          )}
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                            style={{
                              color: tone,
                              border: `1px solid ${tone}55`,
                            }}
                          >
                            {item.status}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                        {item.detail}
                      </p>
                      {item.userImpact && (
                        <p className="mt-2 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2 text-xs leading-relaxed text-[var(--t4)]">
                          <span className="font-black text-[var(--t2)]">
                            User impact:
                          </span>{" "}
                          {item.userImpact}
                        </p>
                      )}
                      <p className="mt-2 text-xs font-semibold text-[var(--t2)]">
                        {item.nextStep}
                      </p>
                      {Array.isArray(item.envKeys) &&
                        item.envKeys.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-1.5">
                            {(Array.isArray(item.envStatus)
                              ? item.envStatus
                              : item.envKeys.map((key: string) => ({
                                  key,
                                  present: false,
                                }))
                            ).map((env: any) => (
                              <code
                                key={env.key}
                                className={`rounded-[var(--r1)] border px-2 py-1 text-[10px] font-bold ${
                                  env.present
                                    ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                                    : "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]"
                                }`}
                              >
                                {env.key} {env.present ? "set" : "missing"}
                              </code>
                            ))}
                          </div>
                        )}
                      {item.unlocks && (
                        <p className="mt-3 rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2 text-xs leading-relaxed text-[var(--t4)]">
                          <span className="font-black text-[var(--t2)]">
                            Unlocks:
                          </span>{" "}
                          {item.unlocks}
                        </p>
                      )}
                      {Array.isArray(item.diagnostics) &&
                        item.diagnostics.length > 0 && (
                          <div className="mt-3 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                              Exact setup values
                            </div>
                            <div className="mt-2 space-y-2">
                              {item.diagnostics.map((diag: any) => (
                                <div key={diag.label} className="min-w-0">
                                  <div className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--t5)]">
                                    {diag.label}
                                  </div>
                                  <code className="mt-1 block break-all rounded-[var(--r1)] border border-[var(--b1)] bg-[var(--s1)] px-2 py-1.5 text-[11px] font-bold text-[var(--t2)]">
                                    {diag.value}
                                  </code>
                                  {diag.help && (
                                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                                      {diag.help}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      {Array.isArray(item.setupSteps) &&
                        item.setupSteps.length > 0 && (
                          <div className="mt-3 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
                            <div className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                              Setup steps
                            </div>
                            <ol className="mt-2 space-y-1.5">
                              {item.setupSteps.map(
                                (step: string, index: number) => (
                                  <li
                                    key={`${item.id}-${index}`}
                                    className="flex gap-2 text-xs leading-relaxed text-[var(--t4)]"
                                  >
                                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--s1)] text-[9px] font-black text-[var(--t3)]">
                                      {index + 1}
                                    </span>
                                    <span>{step}</span>
                                  </li>
                                ),
                              )}
                            </ol>
                            {item.verifyEvidence && (
                              <p className="mt-2 border-t border-[var(--b1)] pt-2 text-xs leading-relaxed text-[var(--t4)]">
                                <span className="font-black text-[var(--t2)]">
                                  Verified when:
                                </span>{" "}
                                {item.verifyEvidence}
                              </p>
                            )}
                          </div>
                        )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {item.setupUrl && item.status !== "ready" && (
                          <a
                            href={item.setupUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex rounded-[var(--r2)] bg-[var(--t1)] px-3 py-1.5 text-xs font-black text-[var(--s0)]"
                          >
                            {item.actionLabel || "Open provider setup"}
                          </a>
                        )}
                        {item.verifyPath && (
                          <Link
                            href={item.verifyPath}
                            className="inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                          >
                            Verify
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="glass-panel p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                  Adoption readiness
                </p>
                <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                  Can a buyer open this and make a decision?
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                  This converts the technical checks into the questions a real
                  salvage, dealer, or wholesale buyer expects the app to answer.
                </p>
              </div>
              <div className="shrink-0 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] px-4 py-3 text-center">
                <Mono
                  className="block text-2xl font-black"
                  style={{
                    fontFamily: "var(--fm)",
                    color:
                      adoptionScore >= 80
                        ? "var(--green)"
                        : adoptionScore >= 50
                          ? "var(--amber)"
                          : "var(--red)",
                  }}
                >
                  {adoptionScore}%
                </Mono>
                <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                  buyer-ready
                </span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {buyerQuestions.map((item) => {
                const tone =
                  item.status === "working"
                    ? "var(--green)"
                    : item.status === "setup"
                      ? "var(--amber)"
                      : "var(--red)";
                return (
                  <div
                    key={item.question}
                    className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-sm font-black text-[var(--t1)]">
                        {item.question}
                      </h3>
                      <span
                        className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                        style={{
                          color: tone,
                          border: `1px solid ${tone}55`,
                          background: `${tone}12`,
                        }}
                      >
                        {item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                      {item.proof}
                    </p>
                    <Link
                      href={item.href}
                      className="mt-3 inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                    >
                      {item.action}
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                  Launch order
                </p>
                <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                  Fix the adoption blockers in the order users feel them.
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                  This keeps the product useful with public preview data while
                  the real database, login, import, and protected-source work
                  comes online.
                </p>
              </div>
              <Link
                href="/sources"
                className="inline-flex w-fit rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
              >
                Source matrix
              </Link>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {launchQueue.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-sm font-black text-[var(--t1)]">
                      {item.title}
                    </h3>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase"
                      style={{
                        color: item.done ? "var(--green)" : "var(--amber)",
                        border: `1px solid ${item.done ? "var(--green)" : "var(--amber)"}55`,
                        background: item.done
                          ? "var(--glo)"
                          : "var(--amber-lo)",
                      }}
                    >
                      {item.done ? "working" : "next"}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                    {item.detail}
                  </p>
                  <Link
                    href={item.href}
                    className="mt-3 inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                  >
                    {item.action}
                  </Link>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-panel p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
                  Operational source proof
                </p>
                <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
                  {readySourceCount
                    ? `${readySourceCount} source${readySourceCount === 1 ? "" : "s"} can show real inventory now.`
                    : "No source is ready to show inventory yet."}
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
                  This is the buyer-facing truth layer: which sources responded,
                  how many vehicles were seen, photo coverage, detail quality,
                  and what should happen next.
                  {proofAverageQuality
                    ? ` Current average detail quality is ${proofAverageQuality}/100.`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={bestReadyScanHref}
                  className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
                >
                  Open ready scan
                </Link>
                <Link
                  href="/sources"
                  className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
                >
                  Source matrix
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
              <Stat
                label="Ready sources"
                value={readySourceCount}
                tone="var(--green)"
              />
              <Stat label="Public rows" value={proofRows.toLocaleString()} />
              <Stat
                label="Rows with photos"
                value={proofPhotoRows.toLocaleString()}
                tone={proofPhotoRows ? "var(--green)" : "var(--amber)"}
              />
              <Stat
                label="Need login"
                value={loginSourceCount}
                tone={loginSourceCount ? "var(--red)" : "var(--green)"}
              />
              <Stat
                label="Blocked"
                value={blockedSourceCount}
                tone={blockedSourceCount ? "var(--red)" : "var(--green)"}
              />
            </div>

            <div className="mt-4 overflow-hidden rounded-[var(--r3)] border border-[var(--b1)]">
              <div className="hidden grid-cols-[1.4fr_.8fr_.8fr_.8fr_1fr] gap-3 border-b border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[var(--t5)] md:grid">
                <span>Source</span>
                <span>Status</span>
                <span>Rows</span>
                <span>Photos</span>
                <span>Action</span>
              </div>
              <div className="divide-y divide-[var(--b1)]">
                {sortedHealthSources.slice(0, 12).map((source) => {
                  const tone = readinessTone(source.readiness);
                  const label =
                    READINESS_LABELS[source.readiness] || source.readiness;
                  const scanHref =
                    source.readiness === "ready"
                      ? scanHrefForSource(source)
                      : source.requiresAuth
                        ? "/sources?filter=login"
                        : `/scan?source=${source.id}&sort=profit`;
                  const action =
                    source.readiness === "ready"
                      ? "View cars"
                      : source.requiresAuth
                        ? "Add login"
                        : source.readiness === "no_rows"
                          ? "Broaden scope"
                          : "Inspect";
                  return (
                    <div
                      key={source.id}
                      className="grid gap-2 px-3 py-3 text-sm md:grid-cols-[1.4fr_.8fr_.8fr_.8fr_1fr] md:items-center md:gap-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-black text-[var(--t1)]">
                          {source.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--t5)]">
                          {source.id} · {source.type} · P{source.priority}
                        </p>
                      </div>
                      <div>
                        <span
                          className="rounded-full px-2 py-1 text-[10px] font-black uppercase"
                          style={{
                            color: tone,
                            border: `1px solid ${tone}55`,
                            background: `${tone}12`,
                          }}
                        >
                          {label}
                        </span>
                      </div>
                      <Mono
                        className="text-xs font-black text-[var(--t2)]"
                        style={{ fontFamily: "var(--fm)" }}
                      >
                        {Number(source.activeRows || 0).toLocaleString()}
                      </Mono>
                      <div className="text-xs font-bold text-[var(--t3)]">
                        {Number(source.rowsWithPhotos || 0).toLocaleString()}{" "}
                        photos · {source.averageQuality || 0}% quality
                      </div>
                      <Link
                        href={scanHref}
                        className="inline-flex w-fit rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
                      >
                        {action}
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Freshness */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat
              label="Active deals"
              value={(f?.activeDeals ?? 0).toLocaleString()}
            />
            <Stat
              label="New (24h)"
              value={(f?.newLast24h ?? 0).toLocaleString()}
              tone="var(--green)"
            />
            <Stat
              label="BUY deals"
              value={(q?.goDeals ?? 0).toLocaleString()}
              tone="var(--amber)"
            />
            <Stat
              label="Watch candidates"
              value={(q?.watchCandidates ?? 0).toLocaleString()}
              tone={(q?.watchCandidates ?? 0) ? "var(--amber)" : "var(--t4)"}
            />
            <Stat
              label="Data freshness"
              value={f?.stale ? "STALE" : "FRESH"}
              tone={f?.stale ? "var(--red)" : "var(--green)"}
            />
          </div>

          {/* Quality coverage */}
          <div className="glass-panel p-5 space-y-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
              Data quality coverage
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {detailBars.map(([label, pct]) => (
                <Bar key={label} label={label} pct={pct} />
              ))}
              <Bar label="Geocoded (mappable)" pct={q?.geocodedPct ?? 0} />
              <Bar label="Has city" pct={q?.cityPct ?? 0} />
            </div>
            <p className="text-xs leading-relaxed text-[var(--t4)]">
              Thin bars are product work, not just scraper work. A deal with a
              photo and price can be browsed; a deal with VIN, title, mileage,
              seller contact, source link, and freshness can be trusted.
            </p>
          </div>

          {/* Valuation accuracy — measured out-of-sample vs real retail prices */}
          {acc && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-3">
                Valuation accuracy{" "}
                <span className="text-[var(--t5)] normal-case tracking-normal">
                  · out-of-sample vs {acc.n.toLocaleString()} real prices
                </span>
              </p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat
                  label="Avg error (MAPE)"
                  value={`${acc.mape}%`}
                  tone={
                    acc.mape <= 12
                      ? "var(--green)"
                      : acc.mape <= 18
                        ? "var(--amber)"
                        : "var(--red)"
                  }
                />
                <Stat
                  label="Bias"
                  value={`${acc.bias > 0 ? "+" : ""}${acc.bias}%`}
                  tone={
                    Math.abs(acc.bias) <= 3 ? "var(--green)" : "var(--amber)"
                  }
                />
                <Stat label="Within 20%" value={`${acc.within20}%`} />
                <Stat label="Within 30%" value={`${acc.within30}%`} />
              </div>
              <p className="mt-3 text-xs text-[var(--t4)]">
                {acc.mape <= 12 ? "Enterprise-grade" : "Improving"} — every
                GO/PASS is backed by a resale number measured within ~{acc.mape}
                % of real market price, with{" "}
                {Math.abs(acc.bias) <= 3 ? "near-zero" : "low"} bias. Validated
                against held-out retail listings, refreshed hourly.
              </p>
            </div>
          )}

          {/* Price knowledge base — the value signals that compound valuation accuracy */}
          {kb && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-3">
                Price knowledge base
              </p>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat
                  label="Resale estimated"
                  value={`${(kb.resaleEstimateBacked ?? 0).toLocaleString()} · ${kb.resaleEstimatePct ?? 0}%`}
                  tone={
                    (kb.resaleEstimatePct ?? 0) >= 70
                      ? "var(--green)"
                      : "var(--amber)"
                  }
                />
                <Stat
                  label="Deal math scored"
                  value={`${(kb.dealMathReady ?? 0).toLocaleString()} · ${kb.dealMathReadyPct ?? 0}%`}
                  tone={
                    (kb.dealMathReadyPct ?? 0) >= 70
                      ? "var(--green)"
                      : "var(--amber)"
                  }
                />
                <Stat
                  label="3rd-party values"
                  value={`${(kb.marketValueBacked ?? 0).toLocaleString()} · ${kb.marketValuePct ?? 0}%`}
                  tone={
                    (kb.marketValueBacked ?? 0) > 0
                      ? "var(--green)"
                      : "var(--red)"
                  }
                />
                <Stat
                  label="Sold price points"
                  value={(kb.soldComps ?? 0).toLocaleString()}
                />
                <Stat
                  label="Learned value groups"
                  value={(kb.aggregateGroups ?? 0).toLocaleString()}
                  tone="var(--amber)"
                />
              </div>
              <p className="mt-3 text-xs text-[var(--t4)]">
                Resale estimates and deal math let the app rank inventory now.
                Third-party values, completed-sale prices, and learned
                make/model/year/state buckets are the next trust layer: they
                turn estimated recommendations into verified market-backed
                recommendations.
              </p>
            </div>
          )}

          {/* Closed-loop learning */}
          <div className="glass-panel p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-2">
              Learning loop
            </p>
            {l?.outcomesLogged > 0 ? (
              <>
                <p className="text-sm text-[var(--t2)] mb-3">
                  Learning from{" "}
                  <Mono
                    style={{ fontFamily: "var(--fm)" }}
                    className="font-bold text-[var(--t1)]"
                  >
                    {l.outcomesLogged}
                  </Mono>{" "}
                  logged outcome{l.outcomesLogged === 1 ? "" : "s"} — the
                  pipeline now prioritizes the makes you actually profit on.
                </p>
                {l.prioritizedMakes?.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {l.prioritizedMakes.map((m: string) => (
                      <span
                        key={m}
                        className="rounded-full px-2.5 py-1 text-xs font-bold capitalize"
                        style={{
                          background: "var(--glo)",
                          color: "var(--green)",
                        }}
                      >
                        {m}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--t4)]">
                    No profitable make yet — log a winning sale to start the
                    loop.
                  </p>
                )}
              </>
            ) : (
              <p className="text-sm text-[var(--t4)]">
                Log sold deals in Intel and the pipeline starts prioritizing the
                segments you profit on — scraping, enrichment, and scoring all
                bend toward your wins.
              </p>
            )}
          </div>

          {/* Live inventory per source — count, freshness, and are we SHOWING the cars (photos) */}
          {breakdown.length > 0 && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-1">
                Listings on file by source
              </p>
              <p className="mb-3 text-xs text-[var(--t4)]">
                Freshness of stored listings. Not a worker heartbeat.
              </p>
              <div className="divide-y divide-[var(--b1)]">
                {breakdown.map((s) => {
                  const live = s.status === "live";
                  const idle = s.status === "idle";
                  const dot = idle
                    ? "var(--t5)"
                    : live
                      ? "var(--green)"
                      : "var(--amber)";
                  const photoTone =
                    s.photoPct >= 70
                      ? "var(--green)"
                      : s.photoPct >= 30
                        ? "var(--amber)"
                        : "var(--red)";
                  return (
                    <div
                      key={s.source}
                      className="flex items-center justify-between py-2.5 gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: dot }}
                        />
                        <span className="text-sm font-bold text-[var(--t1)] capitalize truncate">
                          {s.source.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] font-bold uppercase shrink-0 text-[var(--t4)]">
                          {s.status === "stale"
                            ? "older listings"
                            : s.status === "idle"
                              ? "no stored listings"
                              : "stored listings"}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs shrink-0">
                        <span className="text-[var(--t2)] font-semibold tabular-nums">
                          {Number(s.active).toLocaleString()} cars
                        </span>
                        <span
                          className="font-semibold tabular-nums w-[88px] text-right"
                          style={{ color: photoTone }}
                          title="Share of active listings showing at least one photo"
                        >
                          {s.photoPct}% photos
                        </span>
                        <span className="text-[var(--t4)] w-[64px] text-right">
                          {s.ageHours == null
                            ? "—"
                            : s.ageHours < 1
                              ? "<1h"
                              : `${s.ageHours}h`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Source health */}
          <div className="glass-panel p-5">
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-3">
              Source health (7d)
            </p>
            {sources.length === 0 ? (
              <p className="text-sm text-[var(--t4)]">
                No scrape runs recorded yet. Runs appear here once the scraper
                executes.
              </p>
            ) : (
              <div className="divide-y divide-[var(--b1)]">
                {sources.map((s) => {
                  const rate = s.runs_7d
                    ? Math.round((s.ok_7d / s.runs_7d) * 100)
                    : 0;
                  const dead = s.last3_all_failed;
                  return (
                    <div
                      key={s.source}
                      className="flex items-center justify-between py-2.5 gap-3"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: dead
                              ? "var(--red)"
                              : rate >= 80
                                ? "var(--green)"
                                : "var(--amber)",
                          }}
                        />
                        <span className="text-sm font-bold text-[var(--t1)] capitalize">
                          {s.source.replace(/_/g, " ")}
                        </span>
                        {dead && (
                          <span className="text-[10px] font-bold text-[var(--red)] uppercase">
                            paused (self-heal)
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[var(--t4)]">
                        <span>{rate}% ok</span>
                        <span>~{Number(s.avg_deals) || 0} deals</span>
                        <span>{ago(s.last_ok)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Recent runs */}
          {runs.length > 0 && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-3">
                Recent runs
              </p>
              <div className="divide-y divide-[var(--b1)]">
                {runs.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between py-2 text-xs"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: r.ok ? "var(--green)" : "var(--red)",
                        }}
                      />
                      <span className="text-[var(--t2)] font-semibold capitalize">
                        {r.source.replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="text-[var(--t4)]">
                      {r.deals_found} deals ·{" "}
                      {Math.round((r.duration_ms || 0) / 1000)}s ·{" "}
                      {ago(r.run_at)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
