"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { US_STATES } from "@/lib/utils/titleRules";
import { nearestState, stateName } from "@/lib/geo/us-states";
import {
  buildBuyerScopeLinks,
  planScrapeForBuyerScope,
} from "@/lib/scrapers/buyer-scope";
import { writeLocalBuyerIntent } from "@/hooks/useBuyerIntent";
import { dealerSourceIdForHost } from "@/lib/sources/source-meta";

// Focused, skippable post-signup wizard. Captures the few preferences that unlock a personalized
// feed + sensible cost defaults, then drops the dealer straight into the scanner. Saves via
// /api/profile (same endpoint Settings uses).
const POPULAR_MAKES = [
  "Ford",
  "Chevrolet",
  "Toyota",
  "Honda",
  "Ram",
  "GMC",
  "Nissan",
  "Jeep",
  "BMW",
  "Tesla",
];

const VEHICLE_TYPES = [
  "Trucks",
  "SUVs",
  "Sedans",
  "Vans",
  "Luxury",
  "Performance",
  "Hybrid / EV",
];

const BUYING_LANES = [
  { label: "Salvage & repairable", value: "damaged" },
  { label: "Wholesale auctions", value: "auction" },
  { label: "Private & small dealers", value: "private" },
  { label: "Clean retail", value: "clean-retail" },
  { label: "Repo / government", value: "government" },
  { label: "Parts / teardown", value: "parts" },
];

const SELLER_TYPES = [
  { label: "Any seller", value: "all" },
  { label: "Dealers", value: "dealer" },
  { label: "Auctions", value: "auction" },
  { label: "Private sellers", value: "private" },
];

const DEALER_FOCUS = [
  {
    name: "AE of Miami",
    sourceId: "ae-of-miami",
    host: "aeofmiami.com",
    note: "Miami / Denver salvage dealer",
  },
  {
    name: "Damage.com",
    sourceId: "damage-com",
    host: "damage.com",
    note: "Sikeston repairable inventory",
  },
  {
    name: "D&G Auto",
    sourceId: "dg-auto",
    host: "dgautollc.com",
    note: "Missouri independent dealer",
  },
  {
    name: "ReCar",
    sourceId: "recar",
    host: "recar.com",
    note: "Benton, MO rebuilder supply",
  },
  {
    name: "St. James Auto",
    sourceId: "stjames-auto",
    host: "stjamesautoparts.com",
    note: "Parts and repairable units",
  },
  {
    name: "CAS Miami",
    sourceId: "cas-miami",
    host: "casmiami.com",
    note: "South Florida dealer supply",
  },
];

const GOAL_PRESETS = [
  {
    label: "Working now: gov surplus in FL under $10k",
    vehicleType: "SUVs",
    buyingLane: "government",
    sellerType: "auction",
    titleType: "all",
    homeState: "FL",
    budgetMax: "10000",
    dealerHosts: [],
  },
  {
    label: "Repairable SUVs in FL under $10k",
    vehicleType: "SUVs",
    buyingLane: "damaged",
    sellerType: "dealer",
    titleType: "salvage",
    homeState: "FL",
    budgetMax: "10000",
    dealerHosts: ["aeofmiami.com", "damage.com"],
  },
  {
    label: "Wholesale trucks near TX",
    vehicleType: "Trucks",
    buyingLane: "auction",
    sellerType: "auction",
    titleType: "all",
    homeState: "TX",
    budgetMax: "35000",
    dealerHosts: [],
  },
  {
    label: "Watch AE of Miami and St. James",
    vehicleType: "SUVs",
    buyingLane: "private",
    sellerType: "dealer",
    titleType: "salvage",
    homeState: "FL",
    budgetMax: "",
    dealerHosts: ["aeofmiami.com", "stjamesautoparts.com"],
  },
];

type OnboardingRunPlan = {
  canImport: boolean;
  message: string;
  links?: {
    scanHref?: string;
    proofRankedHref?: string;
    sourceSetupHref?: string;
    sourceHealthHref?: string;
    scopeLabel?: string;
  };
  nextActions?: {
    scan?: string;
    reviewFreshRows?: string;
    verifySources?: string;
  };
  summary: {
    total: number;
    runnable: number;
    heldBack: number;
    estimatedDealsPerRun: number;
    firstBlocker: string | null;
  };
  sources: Array<{
    id: string;
    name: string;
    runnable: boolean;
    readiness: string;
    action: string;
  }>;
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [homeState, setHomeState] = useState("");
  const [targetProfit, setTargetProfit] = useState("3000");
  const [budgetMax, setBudgetMax] = useState("");
  const [makes, setMakes] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState("SUVs");
  const [buyingLane, setBuyingLane] = useState("damaged");
  const [sellerType, setSellerType] = useState("dealer");
  const [titleType, setTitleType] = useState("salvage");
  const [dealerHosts, setDealerHosts] = useState<string[]>([]);
  const [sourceHealth, setSourceHealth] = useState<any>(null);
  const [runPlan, setRunPlan] = useState<OnboardingRunPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  // If the dealer already finished onboarding, don't show the wizard again.
  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.profile?.onboarded) router.replace("/discover");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  const onboardingPlan = useMemo(
    () =>
      planScrapeForBuyerScope({
        vehicleType: vehicleType
          .toLowerCase()
          .replace("hybrid / ev", "hybrid ev"),
        lane: buyingLane,
        state: homeState || "Nationwide",
        titleType: titleType !== "all" ? titleType : undefined,
        sellerType,
        makes,
        maxPrice: budgetMax ? Number(budgetMax) : undefined,
        dealerHosts,
      }),
    [
      vehicleType,
      buyingLane,
      homeState,
      titleType,
      sellerType,
      makes,
      budgetMax,
      dealerHosts,
    ],
  );

  const dealerSourceIds = useMemo(
    () =>
      dealerHosts
        .map((host) => dealerSourceIdForHost(host))
        .filter((id): id is string => Boolean(id)),
    [dealerHosts],
  );

  const scopeInput = useMemo(
    () => ({
      vehicleType: vehicleType
        .toLowerCase()
        .replace("hybrid / ev", "hybrid ev"),
      lane: buyingLane,
      sellerType,
      state: homeState || "Nationwide",
      titleType: titleType !== "all" ? titleType : undefined,
      makes,
      maxPrice: budgetMax ? Number(budgetMax) : undefined,
      dealerHosts,
      dealerSourceIds,
    }),
    [
      vehicleType,
      buyingLane,
      sellerType,
      homeState,
      titleType,
      makes,
      budgetMax,
      dealerHosts,
      dealerSourceIds,
    ],
  );

  const scopeLinks = useMemo(
    () => buildBuyerScopeLinks(scopeInput),
    [scopeInput],
  );
  const onboardingHealthUrl = scopeLinks.sourceHealthHref;
  const firstScanHref =
    runPlan?.nextActions?.scan ||
    runPlan?.links?.scanHref ||
    scopeLinks.scanHref;
  const sourceProofHref =
    runPlan?.nextActions?.verifySources ||
    runPlan?.links?.sourceSetupHref ||
    scopeLinks.sourceSetupHref;

  const requestedSourceIds = useMemo(() => {
    return dealerSourceIds.length ? dealerSourceIds : onboardingPlan.sourceIds;
  }, [dealerSourceIds, onboardingPlan.sourceIds]);

  useEffect(() => {
    let active = true;
    setSourceHealth(null);
    fetch(onboardingHealthUrl)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (active) setSourceHealth(data);
      })
      .catch(() => {
        if (active) setSourceHealth(null);
      });
    return () => {
      active = false;
    };
  }, [onboardingHealthUrl]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      setPlanLoading(true);
      try {
        const res = await fetch("/api/scrape/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            scope: {
              ...scopeInput,
            },
            sourceIds: requestedSourceIds,
          }),
        });
        const data = await res.json();
        if (active) setRunPlan(res.ok ? data : null);
      } catch {
        if (active) setRunPlan(null);
      } finally {
        if (active) setPlanLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    vehicleType,
    buyingLane,
    sellerType,
    homeState,
    titleType,
    makes,
    budgetMax,
    dealerHosts,
    requestedSourceIds,
  ]);

  const selectedSourceHealth = useMemo(() => {
    const rows = Array.isArray(sourceHealth?.sources)
      ? sourceHealth.sources
      : [];
    const wanted = new Set([
      ...onboardingPlan.sourceIds,
      ...((onboardingPlan.scope.dealerSourceIds || []) as string[]),
    ]);
    return rows.filter((row: any) => wanted.has(row.id));
  }, [sourceHealth, onboardingPlan.sourceIds]);
  const readyCount = selectedSourceHealth.filter(
    (row: any) => row.readiness === "ready",
  ).length;
  const knownRows = selectedSourceHealth.reduce(
    (sum: number, row: any) => sum + (Number(row.activeRows) || 0),
    0,
  );
  const needsLoginCount = selectedSourceHealth.filter(
    (row: any) => row.readiness === "needs_login",
  ).length;
  const readySourceNames = selectedSourceHealth
    .filter((row: any) => row.readiness === "ready")
    .map((row: any) => row.name || row.id)
    .slice(0, 3);
  const sourceCompleteness = useMemo(() => {
    const rows = selectedSourceHealth.filter(
      (row: any) => Number(row.activeRows || 0) > 0 && row.completeness,
    );
    const activeTotal = rows.reduce(
      (sum: number, row: any) => sum + (Number(row.activeRows) || 0),
      0,
    );
    const weighted = (key: string) =>
      activeTotal
        ? Math.round(
            rows.reduce(
              (sum: number, row: any) =>
                sum +
                (Number(row.completeness?.[key]) || 0) *
                  (Number(row.activeRows) || 0),
              0,
            ) / activeTotal,
          )
        : 0;
    return {
      activeTotal,
      photosPct: weighted("photosPct"),
      vinPct: weighted("vinPct"),
      titlePct: weighted("titlePct"),
      mileagePct: weighted("mileagePct"),
      damagePct: weighted("damagePct"),
      pricePct: weighted("pricePct"),
      sellerPct: weighted("sellerPct"),
      sellerContactPct: weighted("sellerContactPct"),
      auctionDatePct: weighted("auctionDatePct"),
      sourceLinkPct: weighted("sourceLinkPct"),
    };
  }, [selectedSourceHealth]);
  const sourceCompletenessItems = [
    { label: "Photos", value: sourceCompleteness.photosPct },
    { label: "VIN", value: sourceCompleteness.vinPct },
    { label: "Title", value: sourceCompleteness.titlePct },
    { label: "Mileage", value: sourceCompleteness.mileagePct },
    { label: "Condition", value: sourceCompleteness.damagePct },
    { label: "Price", value: sourceCompleteness.pricePct },
    { label: "Seller", value: sourceCompleteness.sellerPct },
    { label: "Contact", value: sourceCompleteness.sellerContactPct },
    { label: "Auction", value: sourceCompleteness.auctionDatePct },
    { label: "Source link", value: sourceCompleteness.sourceLinkPct },
  ];
  const weakSourceFields = sourceCompletenessItems
    .filter((item) => sourceCompleteness.activeTotal > 0 && item.value < 70)
    .slice(0, 4);
  const watchedDealerNames = dealerHosts
    .map(
      (host) =>
        DEALER_FOCUS.find((dealer) => dealer.host === host)?.name || host,
    )
    .slice(0, 3);
  const blockedSourceNames = selectedSourceHealth
    .filter((row: any) =>
      ["needs_login", "blocked", "disabled"].includes(row.readiness),
    )
    .map(
      (row: any) =>
        `${row.name || row.id}: ${
          row.readiness === "needs_login"
            ? "needs login"
            : row.readiness || "needs setup"
        }`,
    )
    .slice(0, 3);
  const onboardingScopeStatus = sourceHealth?.scopeStatus;
  const plannedSourceCount =
    runPlan?.summary.total || requestedSourceIds.length;

  const toggleMake = (m: string) =>
    setMakes((cur) =>
      cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
    );
  const toggleDealer = (host: string) =>
    setDealerHosts((cur) =>
      cur.includes(host) ? cur.filter((x) => x !== host) : [...cur, host],
    );
  const applyGoalPreset = (preset: (typeof GOAL_PRESETS)[number]) => {
    setVehicleType(preset.vehicleType);
    setBuyingLane(preset.buyingLane);
    setSellerType(preset.sellerType);
    setTitleType(preset.titleType);
    setHomeState(preset.homeState);
    setBudgetMax(preset.budgetMax);
    setDealerHosts(preset.dealerHosts);
    setRunPlan(null);
    toast.success("Goal loaded");
  };

  async function persist(extra: Record<string, unknown>) {
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true, ...extra }),
      });
    } catch {
      // non-fatal — defaults still work
    }
  }

  // Detect the user's state so onboarding is location-aware from the first screen.
  function detectLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn’t available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const code = nearestState(pos.coords.latitude, pos.coords.longitude);
        if (code) {
          setHomeState(code);
          toast.success(`📍 ${stateName(code)}`);
        }
      },
      () => toast.error("Couldn’t get your location"),
      { timeout: 8000 },
    );
  }

  async function finish() {
    setSaving(true);
    setImporting(false);
    await persist({
      home_state: homeState || undefined,
      state: homeState || undefined,
      target_profit: targetProfit ? Number(targetProfit) : undefined,
      budget_max: budgetMax ? Number(budgetMax) : undefined,
      preferred_makes: makes.length ? makes : undefined,
      vehicle_type: vehicleType,
      buying_lane: buyingLane,
      seller_type: sellerType,
      title_type: titleType,
      watched_dealer_hosts: dealerHosts.length ? dealerHosts : undefined,
      watched_dealer_source_ids: dealerSourceIds.length
        ? dealerSourceIds
        : undefined,
    });
    if (dealerHosts.length) {
      try {
        localStorage.setItem("dealer-watch-v1", JSON.stringify(dealerHosts));
        window.dispatchEvent(new Event("dealer-watch-change"));
      } catch {
        /* non-fatal */
      }
    }
    // Seed the user's buyer scope even if they choose nationwide, so Discover and Scan start from
    // a concrete job rather than a generic dashboard.
    const buyerScope = {
      buyerMode: "dealer" as const,
      vehicle: vehicleType,
      lane:
        BUYING_LANES.find((item) => item.value === buyingLane)?.label ||
        buyingLane,
      laneValue: buyingLane,
      sellerType,
      state: homeState || "Nationwide",
      titleType,
      maxPrice: budgetMax ? Number(budgetMax) : undefined,
      targetProfit: targetProfit ? Number(targetProfit) : undefined,
      preferredMakes: makes,
      makes,
      watchedDealers: dealerHosts,
      watchedDealerSourceIds: dealerSourceIds,
    };
    writeLocalBuyerIntent(buyerScope);
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(homeState
            ? {
                carsState: homeState,
                carsStates: [homeState],
              }
            : {}),
          buyerScope,
          watchedDealerHosts: dealerHosts,
          watchedDealerSourceIds: dealerSourceIds,
        }),
      });
    } catch {
      /* non-fatal */
    }
    if (runPlan?.canImport) {
      setImporting(true);
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 25_000);
      try {
        const res = await fetch("/api/scrape/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            scope: {
              ...scopeInput,
            },
            sourceIds: requestedSourceIds,
            concurrency: 1,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          const imported = Number(data?.totalDeals || 0);
          toast.success(
            imported > 0
              ? `Imported ${imported.toLocaleString()} matching rows`
              : "Sources ran. Opening your matching scanner.",
          );
        } else {
          toast.message(
            data?.message || "Saved your goal. Import needs setup.",
          );
        }
      } catch (error) {
        toast.message(
          error instanceof DOMException && error.name === "AbortError"
            ? "Saved your goal. Import is still running; opening your matching scanner."
            : "Saved your goal. Import can be retried from Scan.",
        );
      } finally {
        window.clearTimeout(timeout);
        setImporting(false);
      }
    }
    router.push(firstScanHref);
  }

  // Even on skip, record that we offered onboarding so it doesn't nag every login.
  function skip() {
    persist({});
    router.push("/discover");
  }

  const inputClass =
    "w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-4 py-3 text-[var(--t1)]";

  const steps = [
    {
      title: "What are you trying to find?",
      sub: "Start with the job, not the dashboard. This becomes your default Scan scope.",
      body: (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Fast start
            </label>
            <div className="grid gap-2">
              {GOAL_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => applyGoalPreset(preset)}
                  className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-left text-sm font-black text-[var(--t2)] transition-colors hover:border-[var(--amber-bd)] hover:text-[var(--t1)]"
                >
                  <span>{preset.label}</span>
                  {preset.buyingLane === "government" && (
                    <span className="ml-2 rounded-full border border-[var(--gbd)] bg-[var(--glo)] px-2 py-0.5 text-[10px] font-black uppercase text-[var(--green)]">
                      live proof
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Vehicle type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_TYPES.map((item) => {
                const on = vehicleType === item;
                return (
                  <button
                    key={item}
                    onClick={() => setVehicleType(item)}
                    className="rounded-[var(--r2)] border px-3 py-2 text-left text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--amber-lo)" : "var(--s0)",
                      color: on ? "var(--amber-d)" : "var(--t2)",
                      borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                    }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Buying lane
            </label>
            <div className="grid grid-cols-1 gap-2">
              {BUYING_LANES.map((item) => {
                const on = buyingLane === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setBuyingLane(item.value)}
                    className="rounded-[var(--r2)] border px-3 py-2 text-left text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--amber-lo)" : "var(--s0)",
                      color: on ? "var(--amber-d)" : "var(--t2)",
                      borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Seller type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {SELLER_TYPES.map((item) => {
                const on = sellerType === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setSellerType(item.value)}
                    className="rounded-[var(--r2)] border px-3 py-2 text-left text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--amber-lo)" : "var(--s0)",
                      color: on ? "var(--amber-d)" : "var(--t2)",
                      borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
              This carries into Scan as a seller filter, so the first results
              match how you actually buy.
            </p>
          </div>
        </div>
      ),
    },
    {
      title: "Where do you buy & sell?",
      sub: "We’ll curate cars to your state — no unrelated markets — and price cross-state transport.",
      body: (
        <div className="space-y-3">
          <button
            onClick={detectLocation}
            className="w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-3 text-sm font-bold text-[var(--t2)] hover:text-[var(--t1)]"
          >
            Use my location
          </button>
          <select
            value={homeState}
            onChange={(e) => setHomeState(e.target.value)}
            className={inputClass}
          >
            <option value="">Select your home state</option>
            {US_STATES.map((s: string) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ),
    },
    {
      title: "What’s your target?",
      sub: "Used to pre-fill your max-bid and flag deals worth your time.",
      body: (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Title preference
            </label>
            <select
              value={titleType}
              onChange={(e) => setTitleType(e.target.value)}
              className={inputClass}
            >
              <option value="all">Any title</option>
              <option value="clean">Clean title</option>
              <option value="salvage">Salvage title</option>
              <option value="rebuilt">Rebuilt title</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Target profit per flip ($)
            </label>
            <input
              type="number"
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              className={inputClass}
              placeholder="3000"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Max buy-in budget ($, optional)
            </label>
            <input
              type="number"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              className={inputClass}
              placeholder="25000"
            />
          </div>
        </div>
      ),
    },
    {
      title: "Anything you focus on?",
      sub: "Pick a few makes to tune your “For You” feed. Optional — skip if you buy anything.",
      body: (
        <div className="flex flex-wrap gap-2">
          {POPULAR_MAKES.map((m) => {
            const on = makes.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleMake(m)}
                className="px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors"
                style={{
                  background: on ? "var(--amber-lo)" : "var(--s0)",
                  color: on ? "var(--amber-d)" : "var(--t3)",
                  borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "Any shops you want watched?",
      sub: "Follow small salvage and rebuilder dealers so their fresh listings surface first.",
      body: (
        <div className="space-y-3">
          <div className="grid gap-2">
            {DEALER_FOCUS.map((dealer) => {
              const on = dealerHosts.includes(dealer.host);
              return (
                <button
                  key={dealer.host}
                  onClick={() => toggleDealer(dealer.host)}
                  className="rounded-[var(--r2)] border px-3 py-2 text-left transition-colors"
                  style={{
                    background: on ? "var(--amber-lo)" : "var(--s0)",
                    color: on ? "var(--amber-d)" : "var(--t2)",
                    borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{dealer.name}</span>
                    <span className="text-xs font-black">
                      {on ? "Watching" : "Watch"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-75">
                    {dealer.note} · {dealer.host}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-[var(--t4)]">
            You can edit this anytime in Dealer network. Selected shops are
            saved locally now and synced to preferences when signed in.
          </p>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const cur = steps[step];

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--s1)" }}
    >
      <div
        className="w-full max-w-md glass-panel p-7"
        style={{ animation: "fadeUp 300ms ease-out" }}
      >
        {/* progress dots */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= step ? "var(--amber)" : "var(--b2)" }}
            />
          ))}
        </div>

        <h1 className="text-xl font-black text-[var(--t1)] mb-1">
          {cur.title}
        </h1>
        <p className="text-sm text-[var(--t3)] mb-6">{cur.sub}</p>

        <div className="mb-7">{cur.body}</div>

        <div className="mb-6 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Your first scan
              </div>
              <div className="mt-1 text-sm font-black text-[var(--t1)]">
                {vehicleType} ·{" "}
                {BUYING_LANES.find((item) => item.value === buyingLane)
                  ?.label || buyingLane}
                {homeState ? ` · ${homeState}` : " · Nationwide"}
                {makes.length ? ` · ${makes.slice(0, 2).join("/")}` : ""}
                {makes.length > 2 ? ` +${makes.length - 2}` : ""}
              </div>
            </div>
            <div className="rounded-full border border-[var(--b2)] bg-[var(--s0)] px-3 py-1 text-[10px] font-black text-[var(--t3)]">
              {plannedSourceCount} source{plannedSourceCount === 1 ? "" : "s"}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[var(--r2)] bg-[var(--s0)] px-2 py-2">
              <div className="text-sm font-black text-[var(--green)]">
                {runPlan
                  ? runPlan.summary.runnable
                  : sourceHealth
                    ? readyCount
                    : "…"}
              </div>
              <div className="text-[10px] text-[var(--t5)]">runnable</div>
            </div>
            <div className="rounded-[var(--r2)] bg-[var(--s0)] px-2 py-2">
              <div className="text-sm font-black text-[var(--t1)]">
                {runPlan
                  ? runPlan.summary.estimatedDealsPerRun.toLocaleString()
                  : sourceHealth
                    ? knownRows.toLocaleString()
                    : "…"}
              </div>
              <div className="text-[10px] text-[var(--t5)]">est rows</div>
            </div>
            <div className="rounded-[var(--r2)] bg-[var(--s0)] px-2 py-2">
              <div className="text-sm font-black text-[var(--amber-d)]">
                {runPlan
                  ? runPlan.summary.heldBack
                  : sourceHealth
                    ? needsLoginCount
                    : "…"}
              </div>
              <div className="text-[10px] text-[var(--t5)]">held back</div>
            </div>
          </div>
          {sourceCompleteness.activeTotal > 0 && (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] p-2">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                  Data proof
                </span>
                <span className="text-[10px] font-black uppercase text-[var(--t3)]">
                  {sourceCompleteness.activeTotal.toLocaleString()} scoped rows
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {sourceCompletenessItems.map((item) => (
                  <span
                    key={item.label}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-black ${
                      item.value >= 70
                        ? "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]"
                        : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t5)]"
                    }`}
                  >
                    {item.label} {item.value}%
                  </span>
                ))}
              </div>
              {weakSourceFields.length > 0 && (
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--t5)]">
                  Verify before bidding:{" "}
                  {weakSourceFields
                    .map((item) => `${item.label.toLowerCase()} ${item.value}%`)
                    .join(", ")}
                  .
                </p>
              )}
            </div>
          )}
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--t4)]">
            {dealerHosts.length > 0 && (
              <span className="mb-1 block font-semibold text-[var(--t3)]">
                Watching {watchedDealerNames.join(", ")}
                {dealerHosts.length > watchedDealerNames.length
                  ? ` +${dealerHosts.length - watchedDealerNames.length} more`
                  : ""}{" "}
                as priority sources for this buying scope.
              </span>
            )}
            {makes.length > 0 && (
              <span className="mb-1 block font-semibold text-[var(--t3)]">
                Make focus: {makes.join(", ")}. Scan and Source proof will use
                this as a hard filter.
              </span>
            )}
            {planLoading
              ? "Planning the exact sources for your first scan..."
              : onboardingScopeStatus?.status === "no_match"
                ? `${onboardingScopeStatus.message} ${onboardingScopeStatus.nextAction}`
                : onboardingScopeStatus?.status === "empty"
                  ? `${onboardingScopeStatus.message} ${onboardingScopeStatus.nextAction}`
                  : runPlan
                    ? runPlan.summary.firstBlocker
                      ? `${runPlan.message} First setup step: ${runPlan.summary.firstBlocker}`
                      : runPlan.message
                    : sourceHealth
                      ? readyCount > 0
                        ? `This exact goal has live proof from ${readySourceNames.join(
                            ", ",
                          )}. Use matching rows for discovery, then verify weak fields before bidding.`
                        : blockedSourceNames.length
                          ? `This exact goal is saved, but matching sources need action: ${blockedSourceNames.join(
                              ", ",
                            )}.`
                          : "This exact goal is saved, but matching sources need provider setup before rows appear."
                      : "Checking source readiness for this exact goal..."}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={firstScanHref}
              className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
            >
              Preview exact scan
            </Link>
            <Link
              href={sourceProofHref}
              className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
            >
              Source proof
            </Link>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-sm font-semibold text-[var(--t4)] hover:text-[var(--t2)]"
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2.5 rounded-[var(--r3)] font-bold text-sm bg-[var(--s2)] text-[var(--t2)]"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep(step + 1))}
              disabled={saving}
              className="px-5 py-2.5 rounded-[var(--r3)] font-bold text-sm text-white disabled:opacity-50"
              style={{ background: "var(--amber)" }}
            >
              {isLast
                ? importing
                  ? "Searching fresh rows..."
                  : saving
                    ? "Saving…"
                    : runPlan?.canImport
                      ? "Run & find deals"
                      : "Start finding deals"
                : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
