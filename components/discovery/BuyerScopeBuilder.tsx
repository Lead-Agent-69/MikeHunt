"use client";

import Link from "next/link";
import { titleFilterOptions } from "@/lib/deals/title-filter-options";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import {
  Search,
  MapPin,
  Car,
  Gavel,
  Wrench,
  Store,
  Landmark,
  Star,
  Sparkles,
  ShieldCheck,
  LockKeyhole,
  UserRound,
  BadgeDollarSign,
  UsersRound,
  Hammer,
  Package,
} from "lucide-react";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import {
  BUYER_MODES,
  normalizeBuyerMode,
  readLocalBuyerIntent,
  resolveBuyerIntentScope,
  type BuyerMode,
  writeLocalBuyerIntent,
} from "@/hooks/useBuyerIntent";
import { dealerSourceIdForHost, sourceMeta } from "@/lib/sources/source-meta";
import { laneAllowedForMode } from "@/lib/buyer/lane-access";

const VEHICLE_TYPES = [
  {
    label: "Trucks",
    q: "truck",
    hint: "F-150, Silverado, Tacoma, work trucks",
  },
  { label: "SUVs", q: "suv", hint: "Family haulers, 4x4s, third-row" },
  { label: "Sedans", q: "sedan", hint: "Commuters and fast-turn retail" },
  { label: "Vans", q: "van", hint: "Cargo, passenger, delivery" },
  { label: "Luxury", q: "luxury", hint: "Premium trims and arbitrage" },
  {
    label: "Performance",
    q: "performance",
    hint: "Sports cars and enthusiast demand",
  },
  { label: "Diesel", q: "diesel", hint: "Heavy duty and utility buyers" },
  {
    label: "Hybrid / EV",
    q: "hybrid ev",
    hint: "Fuel saver and electric inventory",
  },
];

const LANES = [
  {
    label: "All deals",
    lane: "all",
    icon: Search,
    hint: "Everything live in inventory",
  },
  {
    label: "Salvage & repairable",
    lane: "damaged",
    titleType: "salvage",
    icon: Wrench,
    hint: "Copart/IAA-style rebuild candidates",
  },
  {
    label: "Wholesale auctions",
    lane: "auction",
    icon: Gavel,
    hint: "Dealer auction and bid lanes",
  },
  {
    label: "Private & retail",
    lane: "private",
    icon: Store,
    hint: "Marketplace and independent sellers",
  },
  {
    label: "Clean retail",
    lane: "clean-retail",
    titleType: "clean",
    icon: Car,
    hint: "Ready-to-retail inventory",
  },
  {
    label: "Repo / government",
    lane: "government",
    q: "repo government surplus",
    icon: Landmark,
    hint: "Fleet, seized, municipal supply",
  },
  {
    label: "Parts / teardown",
    lane: "parts",
    q: "parts teardown",
    icon: Wrench,
    hint: "Parts, teardown, and recon signals",
  },
  {
    label: "Specialty",
    lane: "specialty",
    q: "classic collector specialty",
    icon: Star,
    hint: "Classic, collector, exotic",
  },
];

const STATES = [
  "Nationwide",
  "TX",
  "CA",
  "FL",
  "GA",
  "NC",
  "AZ",
  "OH",
  "MI",
  "PA",
];

// Five title buckets (Amy's title-category helper), sent as titleType and saved as
// buyerScope.titleType: Clean / Rebuilt / Salvage / Rebuildable / Title unknown.
const TITLE_TYPES = titleFilterOptions(null, "Any title");

const SELLER_TYPES = [
  { label: "Any seller", value: "all", hint: "All matching sellers" },
  { label: "Dealer", value: "dealer", hint: "Small shops and retail dealers" },
  { label: "Auction", value: "auction", hint: "Bid lanes and surplus" },
  { label: "Private", value: "private", hint: "Classifieds and marketplaces" },
];

const BUDGETS = [
  { label: "Any budget", value: "" },
  { label: "Under $5k", value: "5000" },
  { label: "Under $10k", value: "10000" },
  { label: "Under $20k", value: "20000" },
  { label: "Under $35k", value: "35000" },
  { label: "Under $50k", value: "50000" },
];

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

const GOAL_RECIPES = [
  {
    label: "Repairable SUVs in FL under $10k",
    vehicle: "SUVs",
    lane: "Salvage & repairable",
    state: "FL",
    titleType: "salvage",
    sellerType: "auction",
    maxPrice: "10000",
  },
  {
    label: "Wholesale trucks near TX",
    vehicle: "Trucks",
    lane: "Wholesale auctions",
    state: "TX",
    titleType: "all",
    sellerType: "auction",
    maxPrice: "35000",
  },
  {
    label: "Government fleet cars nationwide",
    vehicle: "Sedans",
    lane: "Repo / government",
    state: "Nationwide",
    titleType: "all",
    sellerType: "auction",
    maxPrice: "20000",
  },
];

const BUYER_MODE_CHOICES: Array<{
  value: BuyerMode;
  icon: typeof UserRound;
}> = [
  { value: "personal", icon: UserRound },
  { value: "diy", icon: Hammer },
  { value: "parts", icon: Package },
  { value: "reseller", icon: BadgeDollarSign },
  { value: "dealer", icon: UsersRound },
];

type SmartRunPlan = {
  canImport: boolean;
  message: string;
  contract?: {
    scopeLabel: string;
    canImport: boolean;
    sourceIds: string[];
    runnableCount: number;
    heldBackCount: number;
    allowedFilters: {
      lane?: string;
      state?: string | null;
      q?: string | null;
      titleType?: string | null;
      sellerType?: string | null;
      make?: string | null;
      makes?: string[];
      model?: string | null;
      maxPrice?: number | null;
      dealerSourceIds?: string[];
      dealerHosts?: string[];
    };
    proofFields: string[];
    guardrails: string[];
    heldBackSourceIds: string[];
    dealerSourceIds: string[];
    expectedUserPath: Array<{ label: string; href: string }>;
    summary: string;
  };
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
  sourceIds?: string[];
  requestedSourceIds?: string[];
  mismatchedSourceIds?: string[];
  dealerSourceIds?: string[];
  scraperControlReady?: boolean;
  gates?: Array<{
    id: string;
    label: string;
    status: string;
    nextStep?: string;
    actionLabel?: string;
  }>;
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
    estimatedDealsPerRun: number;
    type?: string;
    priority?: string;
  }>;
};

function formatSourceList(sourceIds: string[], limit = 4) {
  if (!sourceIds.length) return "";
  const visible = sourceIds
    .slice(0, limit)
    .map((sourceId) => sourceMeta(sourceId).label)
    .join(", ");
  return `${visible}${sourceIds.length > limit ? `, +${sourceIds.length - limit} more` : ""}`;
}

type SourceScopeStatus = {
  status: "ready" | "empty" | "no_match" | "unfiltered" | string;
  label: string;
  message: string;
  nextAction: string;
  scopeLabel?: string;
};

type SourceHealthProof = {
  id: string;
  name?: string;
  readiness?: string;
  userStatus?: string;
  qualityLabel?: string;
  activeRows?: number;
  rowsWithPhotos?: number;
  photoCoveragePct?: number;
  freshnessHours?: number;
  proofSummary?: string;
  nextAction?: string;
};

function cx(active: boolean) {
  return active
    ? "select-card interactive-surface premium-focus"
    : "select-card interactive-surface premium-focus";
}

export type BuyerScopeBuilderInitialScope = {
  buyerMode?: BuyerMode | string;
  mode?: BuyerMode | string;
  vehicleType?: string;
  lane?: string;
  state?: string;
  titleType?: string;
  sellerType?: string;
  maxPrice?: number | string;
  makes?: string[];
  preferredMakes?: string[];
};

export function BuyerScopeBuilder({
  initialScope,
}: {
  initialScope?: BuyerScopeBuilderInitialScope | null;
}) {
  const dealerWatch = useDealerWatch();
  const {
    prefs,
    save: savePreferences,
    authed,
    isLoading: prefsLoading,
    error: prefsError,
  } = usePreferences();
  const saveRef = useRef(savePreferences);
  const skipInitialSave = useRef(true);
  const hydratedVehicle = useRef("");
  saveRef.current = savePreferences;
  const [preferenceStatus, setPreferenceStatus] = useState("");
  const [preferenceFailed, setPreferenceFailed] = useState(false);
  const [saveAttempt, setSaveAttempt] = useState(0);
  const [buyerMode, setBuyerMode] = useState<BuyerMode>("personal");
  const [vehicle, setVehicle] = useState(VEHICLE_TYPES[0]);
  const [lane, setLane] = useState(LANES[0]);
  const [state, setState] = useState("Nationwide");
  const [titleType, setTitleType] = useState("all");
  const [sellerType, setSellerType] = useState("all");
  const [maxPrice, setMaxPrice] = useState("");
  const [makes, setMakes] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Wholesale auctions are a flip-desk lane; personal / DIY / parts never see it or its recipe.
  const visibleLanes = LANES.filter((item) =>
    laneAllowedForMode(item.lane, buyerMode),
  );
  const visibleRecipes = GOAL_RECIPES.filter((recipe) =>
    laneAllowedForMode(
      LANES.find((item) => item.label === recipe.lane)?.lane,
      buyerMode,
    ),
  );
  useEffect(() => {
    if (!laneAllowedForMode(lane.lane, buyerMode)) setLane(LANES[0]);
  }, [buyerMode, lane.lane]);
  const [previewing, setPreviewing] = useState(false);
  const [running, setRunning] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);
  const [previewPlan, setPreviewPlan] = useState<SmartRunPlan | null>(null);
  const [scopeStatus, setScopeStatus] = useState<SourceScopeStatus | null>(
    null,
  );
  const [scopeHealthLoading, setScopeHealthLoading] = useState(false);
  const [runProof, setRunProof] = useState<{
    imported: number;
    successful: number;
    total: number;
    contract?: SmartRunPlan["contract"];
    sourceHealth?: SourceHealthProof[];
    results: Array<{
      source: string;
      success: boolean;
      dealsFound: number;
      duration: number;
      error?: string;
    }>;
    proofRankedHref?: string;
    sourceSetupHref?: string;
  } | null>(null);
  const applyRecipe = (recipe: (typeof GOAL_RECIPES)[number]) => {
    const nextVehicle = VEHICLE_TYPES.find(
      (item) => item.label === recipe.vehicle,
    );
    const nextLane = LANES.find((item) => item.label === recipe.lane);
    if (nextVehicle) setVehicle(nextVehicle);
    if (nextLane) setLane(nextLane);
    setState(recipe.state);
    setTitleType(recipe.titleType);
    setSellerType(recipe.sellerType);
    setMaxPrice(recipe.maxPrice);
    setMakes([]);
    setPreviewMessage(`Loaded goal: ${recipe.label}`);
    setPreviewPlan(null);
    setRunProof(null);
  };

  useEffect(() => {
    if (prefsLoading || prefsError) return;
    skipInitialSave.current = true;
    let cancelled = false;
    async function loadScope() {
      const localScope = readLocalBuyerIntent();
      const saved =
        resolveBuyerIntentScope(authed, prefs.buyerScope, localScope) || {};
      if (cancelled) return;
      if (initialScope) {
        const vehicleNeedle = String(
          initialScope.vehicleType || "",
        ).toLowerCase();
        const laneNeedle = String(initialScope.lane || "").toLowerCase();
        const initialVehicle = VEHICLE_TYPES.find(
          (item) =>
            item.q.toLowerCase() === vehicleNeedle ||
            item.label.toLowerCase() === vehicleNeedle,
        );
        const initialLane = LANES.find(
          (item) =>
            item.lane.toLowerCase() === laneNeedle ||
            item.label.toLowerCase() === laneNeedle,
        );
        if (initialVehicle) setVehicle(initialVehicle);
        hydratedVehicle.current = initialVehicle?.label || vehicle.label;
        if (initialLane) setLane(initialLane);
        const initialBuyerMode = normalizeBuyerMode(
          initialScope.buyerMode || initialScope.mode,
        );
        if (initialBuyerMode) setBuyerMode(initialBuyerMode);
        if (
          typeof initialScope.state === "string" &&
          STATES.includes(initialScope.state)
        ) {
          setState(initialScope.state);
        }
        if (typeof initialScope.titleType === "string") {
          setTitleType(initialScope.titleType);
        }
        if (typeof initialScope.sellerType === "string") {
          setSellerType(initialScope.sellerType);
        }
        if (initialScope.maxPrice != null) {
          setMaxPrice(String(initialScope.maxPrice));
        }
        const initialMakes = Array.isArray(initialScope.makes)
          ? initialScope.makes
          : Array.isArray(initialScope.preferredMakes)
            ? initialScope.preferredMakes
            : [];
        setMakes(initialMakes);
        setLoaded(true);
        return;
      }
      const savedVehicle = VEHICLE_TYPES.find(
        (item) => item.label === saved.vehicle,
      );
      const savedLane = LANES.find((item) => item.label === saved.lane);
      if (savedVehicle) setVehicle(savedVehicle);
      hydratedVehicle.current = savedVehicle?.label || vehicle.label;
      if (savedLane) setLane(savedLane);
      const savedBuyerMode = normalizeBuyerMode(saved.buyerMode);
      if (savedBuyerMode) setBuyerMode(savedBuyerMode);
      if (typeof saved.state === "string" && STATES.includes(saved.state))
        setState(saved.state);
      if (typeof saved.titleType === "string") setTitleType(saved.titleType);
      if (typeof saved.sellerType === "string") setSellerType(saved.sellerType);
      if (saved.maxPrice != null) setMaxPrice(String(saved.maxPrice));
      setMakes(
        Array.isArray(saved.makes)
          ? saved.makes
          : Array.isArray(saved.preferredMakes)
            ? saved.preferredMakes
            : [],
      );
      setLoaded(true);
    }
    loadScope();
    return () => {
      cancelled = true;
    };
    // Hydrate the form on entry, not on its own debounced write confirmations.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialScope, prefsLoading, prefsError, authed]);

  const dealerSourceIds = useMemo(
    () =>
      dealerWatch.hosts
        .map((host) => dealerSourceIdForHost(host))
        .filter((id): id is string => Boolean(id)),
    [dealerWatch.hosts],
  );

  useEffect(() => {
    if (!loaded || prefsLoading || prefsError) return;
    if (skipInitialSave.current) {
      skipInitialSave.current = false;
      return;
    }
    const buyerScope = {
      buyerMode,
      vehicle: vehicle.label,
      vehicles:
        vehicle.label !== hydratedVehicle.current
          ? vehicle.q
            ? [vehicle.label]
            : []
          : undefined,
      lane: lane.label,
      laneValue: lane.lane,
      state,
      titleType,
      sellerType,
      maxPrice: maxPrice ? Number(maxPrice) : 0,
      preferredMakes: makes,
      makes,
      watchedDealers: dealerWatch.hosts,
      watchedDealerSourceIds: dealerSourceIds,
    };
    let active = true;
    const timer = window.setTimeout(() => {
      setPreferenceStatus("Saving preferences...");
      setPreferenceFailed(false);
      // Only write the watch list once prefs have loaded, or an empty pre-load list would wipe it.
      saveRef
        .current(
          dealerWatch.ready
            ? {
                buyerScope,
                watchedDealerHosts: dealerWatch.hosts,
                watchedDealerSourceIds: dealerSourceIds,
              }
            : { buyerScope },
        )
        .then((confirmed) => {
          if (!active) return;
          writeLocalBuyerIntent(confirmed.buyerScope || buyerScope);
          setPreferenceStatus(
            authed
              ? "Preferences saved to your account"
              : "Preferences saved on this device",
          );
        })
        .catch(() => {
          if (!active) return;
          setPreferenceFailed(true);
          setPreferenceStatus(
            "Could not save preferences. Your search draft is kept.",
          );
        });
    }, 350);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [
    buyerMode,
    vehicle,
    lane,
    state,
    titleType,
    sellerType,
    maxPrice,
    makes,
    dealerWatch.hosts,
    dealerWatch.ready,
    dealerSourceIds,
    loaded,
    prefsLoading,
    prefsError,
    authed,
    saveAttempt,
  ]);

  useEffect(() => {
    setPreviewPlan(null);
    setPreviewMessage(null);
    setRunProof(null);
  }, [
    buyerMode,
    vehicle,
    lane,
    state,
    titleType,
    sellerType,
    maxPrice,
    makes,
    dealerWatch.hosts,
    dealerSourceIds,
  ]);

  const scrapePlan = useMemo(
    () =>
      planScrapeForBuyerScope({
        vehicleType: vehicle.q,
        lane: lane.lane,
        state,
        titleType: titleType !== "all" ? titleType : lane.titleType,
        sellerType: sellerType !== "all" ? sellerType : undefined,
        makes,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        q: lane.q,
        dealerHosts: dealerWatch.hosts,
        dealerSourceIds,
      }),
    [
      vehicle,
      lane,
      state,
      titleType,
      sellerType,
      maxPrice,
      makes,
      dealerWatch.hosts,
      dealerSourceIds,
    ],
  );
  const hasNoMatchingSources = scrapePlan.sourceIds.length === 0;

  const href = useMemo(() => {
    const params = new URLSearchParams();
    const q = [vehicle.q, lane.q].filter(Boolean).join(" ").trim();
    params.set("mode", buyerMode);
    if (q) params.set("q", q);
    if (lane.lane !== "all") params.set("lane", lane.lane);
    const scopedTitle = titleType !== "all" ? titleType : lane.titleType;
    if (scopedTitle) params.set("titleType", scopedTitle);
    if (sellerType !== "all") params.set("sellerType", sellerType);
    if (state !== "Nationwide") params.set("state", state);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (makes.length) params.set("makes", makes.join(","));
    if (dealerWatch.hosts.length)
      params.set("dealers", dealerWatch.hosts.join(","));
    if (dealerSourceIds.length)
      params.set("dealerSourceIds", dealerSourceIds.join(","));
    params.set("sort", "profit");
    return `/scan?${params.toString()}`;
  }, [
    buyerMode,
    vehicle,
    lane,
    state,
    titleType,
    sellerType,
    maxPrice,
    makes,
    dealerWatch.hosts,
    dealerSourceIds,
  ]);

  const proofRankedHref = useMemo(() => {
    const url = new URL(href, "http://local");
    url.searchParams.set("sort", "score");
    url.searchParams.set("review", "fresh-import");
    return `/scan?${url.searchParams.toString()}`;
  }, [href]);

  const sourceSetupHref = useMemo(() => {
    const params = new URLSearchParams();
    const q = [vehicle.q, lane.q].filter(Boolean).join(" ").trim();
    params.set("mode", buyerMode);
    if (q) params.set("q", q);
    if (lane.lane !== "all") params.set("lane", lane.lane);
    if (sellerType !== "all") params.set("sellerType", sellerType);
    if (state !== "Nationwide") params.set("state", state);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (makes.length) params.set("makes", makes.join(","));
    if (dealerWatch.hosts.length)
      params.set("dealers", dealerWatch.hosts.join(","));
    if (dealerSourceIds.length)
      params.set("dealerSourceIds", dealerSourceIds.join(","));
    return `/sources${params.toString() ? `?${params.toString()}` : ""}`;
  }, [
    buyerMode,
    vehicle,
    lane,
    state,
    sellerType,
    maxPrice,
    makes,
    dealerWatch.hosts,
    dealerSourceIds,
  ]);

  const sourceHealthHref = useMemo(() => {
    const params = new URLSearchParams();
    const q = [vehicle.q, lane.q].filter(Boolean).join(" ").trim();
    params.set("mode", buyerMode);
    if (q) params.set("q", q);
    if (lane.lane !== "all") params.set("lane", lane.lane);
    const scopedTitle = titleType !== "all" ? titleType : lane.titleType;
    if (scopedTitle) params.set("titleType", scopedTitle);
    if (sellerType !== "all") params.set("sellerType", sellerType);
    if (state !== "Nationwide") params.set("state", state);
    if (maxPrice) params.set("maxPrice", maxPrice);
    if (makes.length) params.set("makes", makes.join(","));
    if (dealerWatch.hosts.length)
      params.set("dealers", dealerWatch.hosts.join(","));
    if (dealerSourceIds.length)
      params.set("dealerSourceIds", dealerSourceIds.join(","));
    return `/api/scrape/health${params.toString() ? `?${params.toString()}` : ""}`;
  }, [
    buyerMode,
    vehicle,
    lane,
    state,
    titleType,
    sellerType,
    maxPrice,
    makes,
    dealerWatch.hosts,
    dealerSourceIds,
  ]);

  const loadSourceHealth = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      if (!silent) setScopeHealthLoading(true);
      try {
        const res = await fetch(sourceHealthHref, { cache: "no-store" });
        const data = res.ok ? await res.json() : null;
        setScopeStatus(data?.scopeStatus || null);
        return data;
      } catch {
        setScopeStatus(null);
        return null;
      } finally {
        if (!silent) setScopeHealthLoading(false);
      }
    },
    [sourceHealthHref],
  );

  useEffect(() => {
    if (!loaded) return;
    let active = true;
    loadSourceHealth().then((data) => {
      if (!active) return;
      setScopeStatus(data?.scopeStatus || null);
    });
    return () => {
      active = false;
    };
  }, [loadSourceHealth, loaded]);

  const previewSmartRun = async () => {
    setPreviewing(true);
    setPreviewMessage(null);
    setPreviewPlan(null);
    try {
      const scope = {
        vehicleType: vehicle.q,
        lane: lane.lane,
        state,
        titleType: titleType !== "all" ? titleType : lane.titleType,
        sellerType: sellerType !== "all" ? sellerType : undefined,
        makes,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        q: lane.q,
        dealerHosts: dealerWatch.hosts,
        dealerSourceIds,
      };
      const res = await fetch("/api/scrape/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope,
          sourceIds: scrapePlan.sourceIds,
        }),
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(
          data?.message || "We couldn't check matching sources right now.",
        );
      setPreviewMessage(data?.message || "Matching source check is ready.");
      setPreviewPlan(data);
    } catch (error) {
      setPreviewMessage(
        error instanceof Error
          ? error.message
          : "We couldn't check matching sources right now.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  const currentScope = useMemo(
    () => ({
      vehicleType: vehicle.q,
      lane: lane.lane,
      state,
      titleType: titleType !== "all" ? titleType : lane.titleType,
      sellerType: sellerType !== "all" ? sellerType : undefined,
      makes,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      q: lane.q,
      dealerHosts: dealerWatch.hosts,
      dealerSourceIds,
    }),
    [
      vehicle,
      lane,
      state,
      titleType,
      sellerType,
      maxPrice,
      makes,
      dealerWatch.hosts,
      dealerSourceIds,
    ],
  );

  const runSmartImport = async () => {
    setRunning(true);
    setPreviewMessage(null);
    setRunProof(null);
    try {
      const res = await fetch("/api/scrape/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: currentScope,
          sourceIds: previewPlan?.sourceIds || scrapePlan.sourceIds,
          concurrency: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewPlan(data?.sources ? data : previewPlan);
        throw new Error(
          data?.message || "We couldn't start this source check.",
        );
      }
      const imported = Number(data?.totalDeals || 0);
      const successful = Number(data?.successful || 0);
      const total = Number(data?.total || 0);
      const results = Array.isArray(data?.results)
        ? data.results.map((result: any) => ({
            source: String(result.source || "unknown"),
            success: Boolean(result.success),
            dealsFound: Number(result.dealsFound || 0),
            duration: Number(result.duration || 0),
            error: result.error ? String(result.error) : undefined,
          }))
        : [];
      const refreshedHealth = await loadSourceHealth({ silent: true });
      const sourceHealth = Array.isArray(refreshedHealth?.sources)
        ? refreshedHealth.sources
            .filter((source: any) =>
              (
                data?.contract?.sourceIds ||
                previewPlan?.sourceIds ||
                scrapePlan.sourceIds
              ).includes(String(source.id)),
            )
            .slice(0, 6)
            .map((source: any) => ({
              id: String(source.id),
              name: source.name ? String(source.name) : undefined,
              readiness: source.readiness
                ? String(source.readiness)
                : undefined,
              userStatus: source.userStatus
                ? String(source.userStatus)
                : undefined,
              qualityLabel: source.qualityLabel
                ? String(source.qualityLabel)
                : undefined,
              activeRows: Number(source.activeRows || 0),
              rowsWithPhotos: Number(source.rowsWithPhotos || 0),
              photoCoveragePct: Number(source.photoCoveragePct || 0),
              freshnessHours:
                typeof source.freshnessHours === "number"
                  ? source.freshnessHours
                  : undefined,
              proofSummary: source.proofSummary
                ? String(source.proofSummary)
                : undefined,
              nextAction: source.nextAction
                ? String(source.nextAction)
                : undefined,
            }))
        : [];
      setRunProof({
        imported,
        successful,
        total,
        contract: data?.contract,
        sourceHealth,
        results,
        proofRankedHref:
          data?.nextActions?.reviewFreshRows || data?.links?.proofRankedHref,
        sourceSetupHref:
          data?.nextActions?.verifySources || data?.links?.sourceSetupHref,
      });
      setPreviewMessage(
        `Found ${imported.toLocaleString()} matching listing${imported === 1 ? "" : "s"} from ${successful} source${successful === 1 ? "" : "s"}. Review the newest results first, then check any missing photos or details.`,
      );
      setPreviewPlan(null);
    } catch (error) {
      setPreviewMessage(
        error instanceof Error
          ? error.message
          : "We couldn't start this source check.",
      );
    } finally {
      setRunning(false);
    }
  };

  const allowedPreviewSources = previewPlan?.sources.filter(
    (source) => !previewPlan.mismatchedSourceIds?.includes(source.id),
  );
  const heldBackPreviewSources = previewPlan?.sources.filter(
    (source) =>
      !source.runnable || previewPlan.mismatchedSourceIds?.includes(source.id),
  );
  const readyPreviewSources = previewPlan?.sources.filter(
    (source) => source.runnable,
  );
  const missingGates =
    previewPlan?.gates?.filter((gate) => gate.status !== "ready") || [];
  const contractProofLabels: Record<string, string> = {
    photos: "Photos",
    vin: "VIN",
    title: "Title",
    mileage: "Mileage",
    damage: "Damage",
    price: "Price",
    seller: "Seller",
    sellerContact: "Contact",
    auctionDate: "Auction date",
    sourceLink: "Source link",
    lastSeen: "Freshness",
  };
  const hasScopeNoMatch =
    hasNoMatchingSources || scopeStatus?.status === "no_match";
  const hasScopeEmpty = scopeStatus?.status === "empty";
  const stepRail = [
    { label: "Mode", value: BUYER_MODES[buyerMode].label },
    { label: "Vehicle", value: vehicle.label },
    { label: "Lane", value: lane.label },
    { label: "Market", value: state },
    {
      label: "Sources",
      value: hasScopeNoMatch
        ? "Needs match"
        : `${scrapePlan.sourceIds.length} scoped`,
    },
  ];

  return (
    <section className="glass-panel motion-enter p-4 md:p-5 space-y-5">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Build your search
          </p>
          <h2 className="text-xl font-black text-[var(--t1)]">
            {hasScopeNoMatch
              ? "This buyer scope has no safe source match"
              : hasScopeEmpty
                ? scopeStatus?.label || "No ready rows yet"
                : "Pick what, where, and how you buy"}
          </h2>
          <p className="mt-1 text-sm text-[var(--t4)]">
            Current scope: {BUYER_MODES[buyerMode].label} · {vehicle.label} ·{" "}
            {lane.label} · {state}
            {titleType !== "all" ? ` · ${titleType} title` : ""}
            {sellerType !== "all" ? ` · ${sellerType} sellers` : ""}
            {makes.length ? ` · ${makes.slice(0, 2).join("/")}` : ""}
            {makes.length > 2 ? ` +${makes.length - 2}` : ""}
            {maxPrice ? ` · under $${Number(maxPrice).toLocaleString()}` : ""}
          </p>
          <p
            role={preferenceFailed || prefsError ? "alert" : "status"}
            className="mt-2 text-xs text-[var(--t3)]"
          >
            {prefsError
              ? "Could not load account preferences. Reload to try again."
              : preferenceStatus}
          </p>
          {preferenceFailed && (
            <button
              type="button"
              className="min-h-11 text-sm underline"
              onClick={() => setSaveAttempt((attempt) => attempt + 1)}
            >
              Retry saving
            </button>
          )}
          <p className="mt-1 text-xs text-[var(--t5)]">
            {scopeHealthLoading
              ? "Checking availability for this search..."
              : scopeStatus?.message ||
                `This search checks ${scrapePlan.sourceIds.length} market${
                  scrapePlan.sourceIds.length === 1 ? "" : "s"
                }: ${
                  hasNoMatchingSources
                    ? "change the lane or seller type to find a matching market"
                    : formatSourceList(scrapePlan.sourceIds, 4)
                }`}
            {dealerWatch.count
              ? ` · limited to ${dealerWatch.count} watched dealer${dealerWatch.count === 1 ? "" : "s"}`
              : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={previewSmartRun}
            disabled={previewing || running}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Sparkles size={15} />
            {previewing ? "Checking..." : "Check availability"}
          </button>
          <button
            onClick={runSmartImport}
            disabled={running || previewing || hasScopeNoMatch}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--gbd)] bg-[var(--glo)] px-4 py-2.5 text-sm font-bold text-[var(--green)] transition-transform active:scale-[0.98] disabled:opacity-60"
            title={
              hasScopeNoMatch
                ? "Change lane or seller type before running."
                : "Search only the markets that match this buyer scope"
            }
          >
            <ShieldCheck size={15} />
            {running
              ? "Searching..."
              : hasScopeNoMatch
                ? "Choose a matching market"
                : "Find matching listings"}
          </button>
          <Link
            href={sourceSetupHref}
            className="inline-flex items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)]"
          >
            Search availability
          </Link>
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Open matching scan
            <Search size={15} />
          </Link>
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-5">
        {stepRail.map((step, index) => (
          <div
            key={step.label}
            className="interactive-surface rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="grid h-6 w-6 place-items-center rounded-full bg-[var(--s0)] text-[10px] font-black text-[var(--t3)]">
                {index + 1}
              </span>
              <span className="text-[9px] font-black uppercase tracking-[0.16em] text-[var(--t5)]">
                {step.label}
              </span>
            </div>
            <div className="mt-2 truncate text-xs font-black text-[var(--t1)]">
              {step.value}
            </div>
          </div>
        ))}
      </div>

      {previewMessage && (
        <div className="motion-enter rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3 text-sm font-semibold text-[var(--t2)]">
          {previewMessage}
        </div>
      )}

      {(hasScopeNoMatch || hasScopeEmpty) && scopeStatus && (
        <div className="rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3">
          <div className="text-sm font-black text-[var(--amber-d)]">
            {scopeStatus.label}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-[var(--t3)]">
            {scopeStatus.message} {scopeStatus.nextAction}
          </p>
        </div>
      )}

      {runProof && (
        <div className="rounded-[var(--r3)] border border-[var(--gbd)] bg-[var(--glo)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--green)]">
                Search results
              </p>
              <h3 className="mt-1 text-base font-black text-[var(--t1)]">
                {runProof.successful}/{runProof.total} markets checked ·{" "}
                {runProof.imported.toLocaleString()} matching listings found
              </h3>
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--t4)]">
                Review the newest matching vehicles first. Check the photos,
                listing details, and freshness before you act.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={runProof.proofRankedHref || proofRankedHref}
                className="inline-flex items-center justify-center rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--green)]"
              >
                Review newest listings
              </Link>
              <Link
                href={runProof.sourceSetupHref || sourceSetupHref}
                className="inline-flex items-center justify-center rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
              >
                Review availability
              </Link>
            </div>
          </div>
          {runProof.results.length > 0 && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {runProof.results.slice(0, 6).map((result) => (
                <div
                  key={`${result.source}-${result.duration}`}
                  className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--s0)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-black text-[var(--t2)]">
                      {result.source}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                        result.success
                          ? "bg-[var(--glo)] text-[var(--green)]"
                          : "bg-[var(--rlo)] text-[var(--red)]"
                      }`}
                    >
                      {result.success ? "checked" : "needs attention"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] font-semibold text-[var(--t4)]">
                    {result.dealsFound.toLocaleString()} listings ·{" "}
                    {(result.duration / 1000).toFixed(1)}s
                  </div>
                  {result.error && (
                    <div className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--red)]">
                      {result.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {runProof.sourceHealth?.length ? (
            <div className="mt-3">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--green)]">
                Listing availability
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {runProof.sourceHealth.map((source) => (
                  <div
                    key={source.id}
                    className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--s0)] px-3 py-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-black text-[var(--t2)]">
                          {source.name || source.id}
                        </div>
                        <div className="mt-0.5 text-[11px] font-semibold text-[var(--t5)]">
                          {source.qualityLabel ||
                            source.userStatus ||
                            source.readiness ||
                            "checked"}
                          {typeof source.freshnessHours === "number"
                            ? ` · ${
                                source.freshnessHours < 1
                                  ? "<1h fresh"
                                  : `${source.freshnessHours}h fresh`
                              }`
                            : ""}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-[var(--glo)] px-2 py-0.5 text-[10px] font-black text-[var(--green)]">
                        checked
                      </span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-[var(--r1)] bg-[var(--s1)] px-2 py-1.5">
                        <div className="text-xs font-black text-[var(--t1)]">
                          {Number(source.activeRows || 0).toLocaleString()}
                        </div>
                        <div className="text-[9px] font-bold uppercase text-[var(--t5)]">
                          listings
                        </div>
                      </div>
                      <div className="rounded-[var(--r1)] bg-[var(--s1)] px-2 py-1.5">
                        <div className="text-xs font-black text-[var(--t1)]">
                          {Number(source.rowsWithPhotos || 0).toLocaleString()}
                        </div>
                        <div className="text-[9px] font-bold uppercase text-[var(--t5)]">
                          photos
                        </div>
                      </div>
                      <div className="rounded-[var(--r1)] bg-[var(--s1)] px-2 py-1.5">
                        <div className="text-xs font-black text-[var(--t1)]">
                          {Number(source.photoCoveragePct || 0)}%
                        </div>
                        <div className="text-[9px] font-bold uppercase text-[var(--t5)]">
                          coverage
                        </div>
                      </div>
                    </div>
                    {(source.proofSummary || source.nextAction) && (
                      <p className="mt-2 line-clamp-2 text-[10px] leading-relaxed text-[var(--t4)]">
                        {source.proofSummary || source.nextAction}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {runProof.contract && (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--s0)] px-3 py-2">
              <div className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--green)]">
                Your search limits
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {runProof.contract.summary} Listing review includes{" "}
                {runProof.contract.proofFields
                  .map((field) => contractProofLabels[field] || field)
                  .slice(0, 6)
                  .join(", ")}
                {runProof.contract.proofFields.length > 6
                  ? `, +${runProof.contract.proofFields.length - 6} more`
                  : ""}
                .
              </p>
            </div>
          )}
        </div>
      )}

      {previewPlan && (
        <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                Matching source plan
              </p>
              <h3 className="mt-1 text-base font-black text-[var(--t1)]">
                {previewPlan.summary.runnable} ready ·{" "}
                {previewPlan.summary.heldBack} unavailable for this search
              </h3>
              {previewPlan.summary.firstBlocker && (
                <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--t4)]">
                  First unlock: {previewPlan.summary.firstBlocker}
                </p>
              )}
              <p className="mt-1 max-w-xl text-xs leading-relaxed text-[var(--t5)]">
                Only sources that match {lane.label.toLowerCase()}
                {state !== "Nationwide" ? ` in ${state}` : ""} are allowed to
                run.
                {dealerWatch.count
                  ? ` Watched dealers are hard-targeted: ${dealerWatch.hosts.join(", ")}.`
                  : ""}{" "}
                Anything outside your search is held back before checking.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="text-sm font-black text-[var(--t1)]">
                  {previewPlan.summary.total}
                </div>
                <div className="text-[10px] text-[var(--t5)]">sources</div>
              </div>
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="text-sm font-black text-[var(--green)]">
                  {previewPlan.summary.runnable}
                </div>
                <div className="text-[10px] text-[var(--t5)]">ready</div>
              </div>
              <div className="rounded-[var(--r2)] bg-[var(--s0)] px-3 py-2">
                <div className="text-sm font-black text-[var(--t1)]">
                  {previewPlan.summary.estimatedDealsPerRun.toLocaleString()}
                </div>
                <div className="text-[10px] text-[var(--t5)]">
                  est. listings
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-3">
            <div className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
              <div className="flex items-center gap-2 text-xs font-black text-[var(--green)]">
                <ShieldCheck size={14} />
                Matching sources
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t3)]">
                {formatSourceList(
                  previewPlan.sourceIds || scrapePlan.sourceIds,
                  5,
                )}
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-xs font-black text-[var(--t2)]">
                Ready to search
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {previewPlan.canImport
                  ? "Matching sources are ready for this search."
                  : missingGates[0]?.nextStep ||
                    (previewPlan.scraperControlReady
                      ? "Source setup is still required before import."
                      : "This source check is not ready yet. Choose another matching source or try again later.")}
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <div className="text-xs font-black text-[var(--t2)]">
                What to expect
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                {readyPreviewSources?.length || 0} runnable now,{" "}
                {previewPlan.summary.estimatedDealsPerRun.toLocaleString()}{" "}
                estimated listings when source checks are available.
              </p>
            </div>
          </div>

          {previewPlan.contract && (
            <div className="mt-3 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] p-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
                    Protected search limits
                  </p>
                  <h4 className="mt-1 text-sm font-black text-[var(--t1)]">
                    {previewPlan.contract.summary}
                  </h4>
                  <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[var(--t4)]">
                    MikeHunt preserves these choices instead of running a broad
                    fallback:{" "}
                    {[
                      previewPlan.contract.allowedFilters.state || "nationwide",
                      previewPlan.contract.allowedFilters.q || "all vehicles",
                      previewPlan.contract.allowedFilters.sellerType
                        ? `${previewPlan.contract.allowedFilters.sellerType} sellers`
                        : null,
                      previewPlan.contract.allowedFilters.makes?.length
                        ? previewPlan.contract.allowedFilters.makes.join("/")
                        : null,
                      previewPlan.contract.allowedFilters.maxPrice
                        ? `under $${Number(
                            previewPlan.contract.allowedFilters.maxPrice,
                          ).toLocaleString()}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    .
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-3">
                  <div className="rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
                    <div className="font-black text-[var(--green)]">
                      {previewPlan.contract.runnableCount}
                    </div>
                    <div className="text-[var(--t5)]">will check</div>
                  </div>
                  <div className="rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
                    <div className="font-black text-[var(--amber-d)]">
                      {previewPlan.contract.heldBackCount}
                    </div>
                    <div className="text-[var(--t5)]">held back</div>
                  </div>
                  <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
                    <div className="font-black text-[var(--t1)]">
                      {previewPlan.contract.proofFields.length}
                    </div>
                    <div className="text-[var(--t5)]">proof fields</div>
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {previewPlan.contract.proofFields.map((field) => (
                  <span
                    key={field}
                    className="rounded-full border border-[var(--b1)] bg-[var(--s1)] px-2 py-1 text-[10px] font-black text-[var(--t3)]"
                  >
                    {contractProofLabels[field] || field}
                  </span>
                ))}
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {previewPlan.contract.guardrails.slice(0, 4).map((item) => (
                  <div
                    key={item}
                    className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-[11px] font-semibold leading-relaxed text-[var(--t4)]"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </div>
          )}

          {previewPlan.mismatchedSourceIds?.length ? (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
              <div className="flex items-start gap-2">
                <LockKeyhole
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--amber-d)]"
                />
                <div>
                  <p className="text-xs font-black text-[var(--amber-d)]">
                    Outside this buyer lane
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--t3)]">
                    {previewPlan.mismatchedSourceIds.join(", ")}{" "}
                    {previewPlan.mismatchedSourceIds.length === 1
                      ? "was"
                      : "were"}{" "}
                    not included because the current scope is{" "}
                    {lane.label.toLowerCase()}.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {previewPlan.dealerSourceIds?.length ? (
            <div className="mt-3 rounded-[var(--r2)] border border-[var(--gbd)] bg-[var(--glo)] px-3 py-2">
              <div className="flex items-start gap-2">
                <ShieldCheck
                  size={14}
                  className="mt-0.5 shrink-0 text-[var(--green)]"
                />
                <div>
                  <p className="text-xs font-black text-[var(--green)]">
                    Dealer targets included
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[var(--t3)]">
                    {previewPlan.dealerSourceIds.join(", ")} will run through
                    the curated dealer network for this buyer lane.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="stagger-children mt-3 grid gap-2 sm:grid-cols-2">
            {(allowedPreviewSources || previewPlan.sources)
              .slice(0, 6)
              .map((source) => (
                <div
                  key={source.id}
                  className="interactive-surface rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-black text-[var(--t2)]">
                      {source.name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                        source.runnable
                          ? "bg-[var(--glo)] text-[var(--green)]"
                          : "bg-[var(--amber-lo)] text-[var(--amber-d)]"
                      }`}
                    >
                      {source.runnable
                        ? "ready"
                        : source.readiness.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {source.type && (
                      <span className="rounded-full bg-[var(--s1)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--t5)]">
                        {source.type}
                      </span>
                    )}
                    {source.priority && (
                      <span className="rounded-full bg-[var(--s1)] px-2 py-0.5 text-[9px] font-black uppercase text-[var(--t5)]">
                        {source.priority}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[var(--t5)]">
                    {source.action}
                  </p>
                </div>
              ))}
          </div>
          {heldBackPreviewSources?.length ? (
            <details className="mt-3 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-2">
              <summary className="cursor-pointer text-xs font-black text-[var(--t2)]">
                {heldBackPreviewSources.length} held back / needs setup
              </summary>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {heldBackPreviewSources.slice(0, 8).map((source) => (
                  <div
                    key={`held-${source.id}`}
                    className="rounded-[var(--r1)] bg-[var(--s1)] px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] font-black text-[var(--t2)]">
                        {source.name}
                      </span>
                      <span className="shrink-0 text-[10px] font-black text-[var(--amber-d)]">
                        {source.readiness.replace(/_/g, " ")}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--t5)]">
                      {source.action}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      )}

      <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
        <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
          Goal shortcuts
        </div>
        <div className="flex flex-wrap gap-2">
          {visibleRecipes.map((recipe) => (
            <button
              key={recipe.label}
              type="button"
              onClick={() => applyRecipe(recipe)}
              className="interactive-surface premium-focus rounded-full border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)] hover:border-[var(--amber-bd)] hover:text-[var(--t1)]"
            >
              {recipe.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-[var(--t5)]">
              Buyer mode
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-[var(--t4)]">
              One vehicle intelligence engine, different decision lens. Personal
              buyers should not get a PASS just because resale profit is thin;
              dealers should still see inventory fit, turnover, and capital.
            </p>
          </div>
          <div className="rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 py-1 text-[11px] font-black text-[var(--t3)]">
            {BUYER_MODES[buyerMode].question}
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-4">
          {BUYER_MODE_CHOICES.map((choice) => {
            const meta = BUYER_MODES[choice.value];
            const Icon = choice.icon;
            const active = buyerMode === choice.value;
            return (
              <button
                key={choice.value}
                type="button"
                onClick={() => setBuyerMode(choice.value)}
                data-active={active}
                className={`rounded-[var(--r2)] px-3 py-3 text-left ${cx(active)}`}
              >
                <div className="flex items-center gap-2 text-sm font-black">
                  <Icon size={15} />
                  {meta.label}
                </div>
                <p className="mt-1 text-[11px] leading-relaxed opacity-75">
                  {meta.question}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {meta.priorities.slice(0, 3).map((priority) => (
                    <span
                      key={priority}
                      className="rounded-full bg-[var(--s1)] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide opacity-80"
                    >
                      {priority}
                    </span>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr_0.9fr]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <Car size={14} /> Vehicle type
          </div>
          <div className="stagger-children grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((item) => (
              <button
                key={item.label}
                onClick={() => setVehicle(item)}
                data-active={vehicle.label === item.label}
                className={`rounded-[var(--r2)] px-3 py-2 text-left ${cx(vehicle.label === item.label)}`}
              >
                <div className="text-sm font-bold">{item.label}</div>
                <div className="mt-0.5 text-[11px] opacity-70">{item.hint}</div>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-bold text-[var(--t4)]">
                Make focus
              </div>
              {makes.length > 0 && (
                <button
                  type="button"
                  onClick={() => setMakes([])}
                  className="text-[10px] font-black uppercase tracking-wide text-[var(--t5)] hover:text-[var(--t2)]"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_MAKES.map((make) => {
                const on = makes.includes(make);
                return (
                  <button
                    key={make}
                    type="button"
                    onClick={() =>
                      setMakes((current) =>
                        current.includes(make)
                          ? current.filter((item) => item !== make)
                          : [...current, make],
                      )
                    }
                    data-active={on}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${cx(on)}`}
                  >
                    {make}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--t5)]">
              Your results stay focused on these makes across discovery,
              comparison, and saved searches.
            </p>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <Gavel size={14} /> Buying lane
          </div>
          <div className="stagger-children grid grid-cols-1 gap-2 sm:grid-cols-2">
            {visibleLanes.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => setLane(item)}
                  data-active={lane.label === item.label}
                  className={`rounded-[var(--r2)] px-3 py-2 text-left ${cx(lane.label === item.label)}`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon size={14} />
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-70">
                    {item.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <MapPin size={14} /> Market
          </div>
          <div className="flex flex-wrap gap-2">
            {STATES.map((item) => (
              <button
                key={item}
                onClick={() => setState(item)}
                data-active={state === item}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ${cx(state === item)}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-2 text-xs font-bold text-[var(--t4)]">
                Seller type
              </div>
              <div className="grid grid-cols-2 gap-2">
                {SELLER_TYPES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setSellerType(item.value)}
                    data-active={sellerType === item.value}
                    className={`rounded-[var(--r2)] px-3 py-2 text-left ${cx(sellerType === item.value)}`}
                  >
                    <div className="text-xs font-black">{item.label}</div>
                    <div className="mt-0.5 text-[10px] opacity-70">
                      {item.hint}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold text-[var(--t4)]">
                Title type
              </div>
              <div className="flex flex-wrap gap-2">
                {TITLE_TYPES.map((item) => (
                  <button
                    key={item.value}
                    onClick={() => setTitleType(item.value)}
                    data-active={titleType === item.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${cx(titleType === item.value)}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-xs font-bold text-[var(--t4)]">
                Max buy-in
              </div>
              <div className="flex flex-wrap gap-2">
                {BUDGETS.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => setMaxPrice(item.value)}
                    data-active={maxPrice === item.value}
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${cx(maxPrice === item.value)}`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
