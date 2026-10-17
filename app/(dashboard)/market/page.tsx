"use client";

import React from "react";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/ErrorState";
import { DealTable, type TableRow } from "@/components/scan/DealTable";
import { Ico } from "@/components/shared/Ico";
import { USHeatmap } from "@/components/market/USHeatmap";
import { MarketVisualizers } from "@/components/market/MarketVisualizers";
import {
  MarketFacetStudio,
  type MarketFacetKey,
} from "@/components/market/MarketFacetStudio";
import { MarketResultsMap } from "@/components/market/MarketResultsMap";
import { MarketListingCard } from "@/components/market/MarketListingCard";
import { MarketReturnPosition } from "@/components/market/MarketReturnPosition";
import { MarketIntelligence } from "@/components/market/MarketIntelligence";
import { MarketLocation } from "@/components/market/MarketLocation";
import type { MarketFacetCount, MarketListing } from "@/lib/market/explorer";
import { InventoryDetailFilters } from "@/components/search/InventoryDetailFilters";
import {
  readInventoryDetails,
  INVENTORY_DETAIL_FIELDS,
} from "@/lib/search/extended-inventory-filters";
import {
  INVENTORY_SOURCE_FILTERS,
  sourceUrlNeedles,
  VEHICLE_CATEGORY_FILTERS,
} from "@/lib/search/inventory-filters";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
  X,
  LayoutGrid,
  List,
  Map as MapIcon,
  BarChart3,
  BookmarkPlus,
  SlidersHorizontal,
} from "lucide-react";
import { useDebouncedValue } from "@/components/ui/performance-optimizations";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { usePreferences } from "@/hooks/usePreferences";
import { replaceInventoryHistory } from "@/lib/search/inventory-history";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import {
  PriceRangeSelector,
  YearRangeSelector,
} from "@/components/shared/PriceRangeSelector";
import { saveLocalSavedSearch } from "@/hooks/useLocalSavedSearches";

// /market — the advanced sourcing surface. A dealer dials in exactly what they want (states, channel,
// price, year, miles, make, condition, verdict) and flips between CURATED (deals worth acting on) and
// WHOLE MARKET (everything). Every filter shows a live count from the server's facets. Built on the
// shared design tokens so it inherits whatever theme is active.

// prettier-ignore
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const LANES: { key: string; label: string }[] = [
  { key: "salvage", label: "Salvage" },
  { key: "repairable", label: "Repairable" },
  { key: "auction", label: "Auction" },
  { key: "clean-retail", label: "Retail" },
  { key: "private", label: "Private" },
];

const CONDITIONS = [
  "salvage_title",
  "rebuilt_title",
  "repairable",
  "clean_title",
  "run_drive",
  "flood",
  "fire",
  "hail",
  "parts_only",
];

const VERDICTS = [
  { key: "go", label: "Research candidate" },
  { key: "hold", label: "Hold" },
  { key: "pass", label: "Pass" },
];

type Filters = {
  near: string;
  radius: string;
  lat: string;
  lng: string;
  priceKind: string;
  priceBasis: string;
  q: string;
  states: string[];
  lanes: string[];
  makes: string[];
  sources: string[];
  model: string;
  minMileage: string;
  categories: string[]; // New: vehicle categories
  conditions: string[];
  verdicts: string[];
  sellerTypes: string[];
  minRoi: string;
  priceMin: string;
  priceMax: string;
  yearMin: string;
  yearMax: string; // New: max year
  mileageMax: string;
  minProfit: string;
  mode: "curated" | "all";
  sort: string;
  sortDir: "asc" | "desc";
};

const EMPTY: Filters = {
  near: "",
  radius: "",
  lat: "",
  lng: "",
  priceKind: "",
  priceBasis: "cash",
  q: "",
  states: [],
  lanes: [],
  makes: [],
  sources: [],
  model: "",
  minMileage: "",
  categories: [],
  conditions: [],
  verdicts: [],
  sellerTypes: [],
  minRoi: "",
  priceMin: "",
  priceMax: "",
  yearMin: "",
  yearMax: "",
  mileageMax: "",
  minProfit: "",
  mode: "all",
  sort: "lastSeenAt",
  sortDir: "desc",
};

async function fetchMarket(url: string) {
  // Preserve the shared retry policy while surfacing actionable location validation.
  const response = await fetch(url);
  if (response.ok) return response.json();
  const body = await response.json().catch(() => ({}));
  const error = Object.assign(new Error("Market data could not be loaded."), {
    status: response.status,
    marketMessage:
      [400, 422].includes(response.status) && typeof body.error === "string"
        ? body.error
        : undefined,
  });
  throw error;
}

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/** Keep shared legacy Scan/Discover links useful while Market Explorer becomes the one workspace. */
function normalizeLegacyMarketParams(params: URLSearchParams) {
  const copy = (legacy: string, current: string) => {
    const value = params.get(legacy);
    if (value != null && !params.has(current)) params.set(current, value);
  };
  copy("zip", "near");
  copy("make", "makes");
  copy("source", "sources");
  copy("sellerType", "sellerTypes");
  copy("minPrice", "priceMin");
  copy("maxPrice", "priceMax");
  copy("minYear", "yearMin");
  copy("maxYear", "yearMax");
  copy("maxMileage", "mileageMax");

  if (!params.has("states")) {
    const state = (params.get("state") || "").trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(state)) params.set("states", state);
  }
  if (!params.has("lanes")) {
    const lane = (params.get("lane") || "").trim().toLowerCase();
    if (["auction", "government"].includes(lane))
      params.set("lanes", "auction");
    else if (["damaged", "salvage"].includes(lane))
      params.set("lanes", "salvage,repairable");
    else if (["private", "clean-retail"].includes(lane))
      params.set("lanes", lane);
  }
  if (!params.has("conditions")) {
    const conditions = (params.get("titleType") || "")
      .split(",")
      .map(
        (value) =>
          ({
            clean: "clean_title",
            rebuilt: "rebuilt_title",
            salvage: "salvage_title",
            rebuildable: "repairable",
          })[value.trim().toLowerCase()],
      )
      .filter(Boolean);
    if (conditions.length) params.set("conditions", conditions.join(","));
  }

  const legacySort = params.get("sort");
  const sortMap: Record<string, [string, "asc" | "desc"]> = {
    price: ["askPrice", "asc"],
    "price-asc": ["askPrice", "asc"],
    "price-desc": ["askPrice", "desc"],
    newest: ["lastSeenAt", "desc"],
    profit: ["profitEstimate", "desc"],
    margin: ["profitEstimate", "desc"],
    score: ["profitScore", "desc"],
    mileage: ["mileage", "asc"],
    year: ["year", "desc"],
  };
  if (legacySort && legacySort in sortMap) {
    const [sort, sortDir] = sortMap[legacySort];
    params.set("sort", sort);
    if (!params.has("sortDir")) params.set("sortDir", sortDir);
  }
}

export default function MarketPage() {
  const { intent } = useBuyerIntent();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
  const [f, setF] = React.useState<Filters>(EMPTY);
  const [details, setDetails] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [copyStatus, setCopyStatus] = React.useState("");
  const [saveStatus, setSaveStatus] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [sourceSearch, setSourceSearch] = React.useState("");
  const matchingSources = INVENTORY_SOURCE_FILTERS.filter((source) =>
    `${source.name} ${source.id} ${sourceUrlNeedles(source.id).join(" ")}`
      .replace(/[^a-z0-9]/gi, "")
      .toLowerCase()
      .includes(sourceSearch.replace(/[^a-z0-9]/gi, "").toLowerCase()),
  );
  const [showInsights, setShowInsights] = React.useState(false);
  const [view, setView] = React.useState<"grid" | "table">("grid");
  const [showMap, setShowMap] = React.useState(false);
  const set = (patch: Partial<Filters>) => {
    setPage(0);
    setF((p) => ({
      ...p,
      ...patch,
      ...(patch.near === "" && patch.lat === "" && p.sort === "distanceMiles"
        ? { sort: "lastSeenAt", sortDir: "desc" as const }
        : {}),
    }));
  };
  const setDetail = (key: string, value: string) => {
    setPage(0);
    setDetails((current) => ({ ...current, [key]: value }));
  };
  const reset = () => {
    setPage(0);
    setF(EMPTY);
    setDetails({});
  };
  React.useEffect(() => {
    if (prefsLoading) return;
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      normalizeLegacyMarketParams(params);
      const next = { ...EMPTY };
      if (!params.toString()) {
        if (/^\d{5}$/.test(prefs.homeLocation?.zip || "")) {
          next.near = prefs.homeLocation!.zip!;
          next.radius = String(prefs.homeLocation?.radiusMi || 100);
        } else {
          next.states = prefs.carsStates?.length
            ? prefs.carsStates
            : prefs.carsState
              ? [prefs.carsState]
              : [];
        }
      }
      for (const key of Object.keys(EMPTY) as (keyof Filters)[]) {
        const value = params.get(key);
        if (value == null) continue;
        if (Array.isArray(EMPTY[key]))
          (next as any)[key] = value.split(",").filter(Boolean);
        else (next as any)[key] = value;
      }
      next.mode = next.mode === "curated" ? "curated" : "all";
      next.sortDir = next.sortDir === "asc" ? "asc" : "desc";
      if (
        ![
          "askPrice",
          "profitEstimate",
          "profitScore",
          "sellEstimate",
          "mileage",
          "year",
          "lastSeenAt",
          "distanceMiles",
        ].includes(next.sort)
      )
        next.sort = EMPTY.sort;
      setF(next);
      setDetails(readInventoryDetails(params));
      setPage(Math.max(0, Math.floor(Number(params.get("page")) || 0)));
      setReady(true);
    };
    restore();
    window.addEventListener("popstate", restore);
    window.addEventListener("inventory-scope-change", restore);
    return () => {
      window.removeEventListener("popstate", restore);
      window.removeEventListener("inventory-scope-change", restore);
    };
  }, [prefsLoading, prefs.homeLocation, prefs.carsStates, prefs.carsState]);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (f.near) p.set("near", f.near);
    if (f.radius) p.set("radius", f.radius);
    if (f.lat && f.lng) {
      p.set("lat", f.lat);
      p.set("lng", f.lng);
    }
    if (f.priceKind) p.set("priceKind", f.priceKind);
    p.set("priceBasis", f.priceBasis === "advertised" ? "advertised" : "cash");
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.states.length) p.set("states", f.states.join(","));
    if (f.lanes.length) p.set("lanes", f.lanes.join(","));
    const selectedMakes = f.makes.map((make) => make.trim()).filter(Boolean);
    if (selectedMakes.length) p.set("makes", selectedMakes.join(","));
    if (f.sources.length) p.set("sources", f.sources.join(","));
    if (f.model.trim()) p.set("model", f.model.trim());
    if (f.minMileage) p.set("minMileage", f.minMileage);
    for (const [key, value] of Object.entries(details))
      if (value) p.set(key, value);
    if (f.categories.length) p.set("categories", f.categories.join(","));
    if (f.conditions.length) p.set("conditions", f.conditions.join(","));
    if (flipDesk && f.verdicts.length) p.set("verdicts", f.verdicts.join(","));
    if (f.sellerTypes.length) p.set("sellerTypes", f.sellerTypes.join(","));
    if (flipDesk && f.minRoi) p.set("minRoi", f.minRoi);
    if (f.priceMin) p.set("priceMin", f.priceMin);
    if (f.priceMax) p.set("priceMax", f.priceMax);
    if (f.yearMin) p.set("yearMin", f.yearMin);
    if (f.yearMax) p.set("yearMax", f.yearMax);
    if (f.mileageMax) p.set("mileageMax", f.mileageMax);
    if (flipDesk && f.minProfit) p.set("minProfit", f.minProfit);
    p.set("mode", flipDesk ? f.mode : "all");
    p.set(
      "sort",
      !flipDesk &&
        ["profitEstimate", "profitScore", "sellEstimate"].includes(f.sort)
        ? "askPrice"
        : f.sort,
    );
    p.set("sortDir", f.sortDir);
    p.set("pageSize", "50");
    p.set("page", String(page));
    return p.toString();
  }, [f, details, page, flipDesk]);
  const debouncedQs = useDebouncedValue(qs, 350);
  const saveCurrentSearch = () => {
    try {
      const params = new URLSearchParams(qs);
      params.delete("page");
      params.delete("pageSize");
      const vehicle = [f.makes.filter(Boolean).join(" + "), f.model]
        .filter(Boolean)
        .join(" ");
      const location =
        f.near || (f.states.length ? f.states.join(" + ") : "Nationwide");
      const saved = saveLocalSavedSearch({
        name: [vehicle || f.q.trim() || "All vehicles", location]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 80),
        q: f.q.trim() || null,
        makes: f.makes.map((make) => make.trim()).filter(Boolean),
        model: f.model.trim() || null,
        state: f.states.length === 1 ? f.states[0] : null,
        lane: f.lanes.length === 1 ? f.lanes[0] : null,
        seller_type: f.sellerTypes.length === 1 ? f.sellerTypes[0] : null,
        min_year: Number(f.yearMin) || null,
        max_year: Number(f.yearMax) || null,
        min_price: Number(f.priceMin) || null,
        max_price: Number(f.priceMax) || null,
        target_profit: flipDesk ? Number(f.minProfit) || null : null,
        require_go: flipDesk && f.verdicts.includes("go"),
        notify_email: false,
        notify_sms: false,
        market_params: params.toString(),
      });
      setSaveStatus(`Saved “${saved.name}” on this device`);
    } catch (error) {
      setSaveStatus(
        error instanceof Error ? error.message : "Search could not be saved.",
      );
    }
  };
  const pendingFilters = !ready || qs !== debouncedQs;
  React.useEffect(() => {
    if (ready) replaceInventoryHistory(`/market?${qs}`);
  }, [qs, ready]);

  const { data, error, isLoading, mutate } = useSWR(
    !pendingFilters ? `/api/market/explore?${debouncedQs}` : null,
    fetchMarket,
    {
      keepPreviousData: false,
    },
  );

  const rows: MarketListing[] = pendingFilters ? [] : data?.rows || [];
  React.useEffect(() => {
    if (!pendingFilters && typeof data?.page === "number" && data.page !== page)
      setPage(data.page);
  }, [data?.page, page, pendingFilters]);
  const busy = pendingFilters || isLoading;
  const facets = data?.facets || {
    states: {},
    lanes: {},
    topMakes: [],
    laneColors: {},
  };
  const total: number = data?.total ?? 0;
  const activeCount =
    Object.values(details).filter(Boolean).length +
    (f.priceKind ? 1 : 0) +
    (f.near || f.lat ? 1 : 0) +
    f.sources.length +
    (f.model ? 1 : 0) +
    (f.minMileage ? 1 : 0) +
    f.states.length +
    f.lanes.length +
    f.makes.length +
    f.categories.length +
    f.conditions.length +
    (flipDesk ? f.verdicts.length : 0) +
    f.sellerTypes.length +
    (flipDesk && f.minRoi ? 1 : 0) +
    (f.priceMin ? 1 : 0) +
    (f.priceMax ? 1 : 0) +
    (f.yearMin ? 1 : 0) +
    (f.yearMax ? 1 : 0) +
    (f.mileageMax ? 1 : 0) +
    (flipDesk && f.minProfit ? 1 : 0) +
    (f.q.trim() ? 1 : 0);
  const baseChips = (
    Object.entries(f) as [keyof Filters, Filters[keyof Filters]][]
  ).filter(
    ([key, value]) =>
      ![
        "sort",
        "sortDir",
        "mode",
        "near",
        "radius",
        "lat",
        "lng",
        "priceBasis",
      ].includes(key) &&
      (flipDesk || !["verdicts", "minRoi", "minProfit"].includes(key)) &&
      (Array.isArray(value) ? value.length > 0 : Boolean(value)),
  );
  const baseLabels: Partial<Record<keyof Filters, string>> = {
    q: "Search",
    states: "States",
    lanes: "Channels",
    makes: "Makes",
    sources: "Sources",
    model: "Model",
    minMileage: "Miles from",
    mileageMax: "Miles to",
    categories: "Vehicle types",
    conditions: "Condition",
    verdicts: "Verdict",
    sellerTypes: "Sellers",
    minRoi: "ROI from (%)",
    priceMin: "Listed price from ($)",
    priceMax: "Listed price to ($)",
    yearMin: "Year from",
    yearMax: "Year to",
    minProfit: "Profit from ($)",
    priceKind: "Price type",
  };

  const selectFacet = (key: MarketFacetKey, value: string) => {
    const selectDetail = (detailKey: string) => {
      setDetail(detailKey, details[detailKey] === value ? "" : value);
    };
    if (key === "make") {
      set({ makes: toggle(f.makes, value), model: "" });
      return;
    }
    if (key === "model") {
      set({ model: f.model === value ? "" : value });
      return;
    }
    if (key === "year") {
      const active = f.yearMin === value && f.yearMax === value;
      set({ yearMin: active ? "" : value, yearMax: active ? "" : value });
      return;
    }
    if (key === "condition") {
      set({ conditions: toggle(f.conditions, value) });
      return;
    }
    if (key === "source") {
      set({ sources: toggle(f.sources, value) });
      return;
    }
    if (key === "sellerType") {
      set({ sellerTypes: toggle(f.sellerTypes, value) });
      return;
    }
    if (key === "priceKind") {
      set({ priceKind: f.priceKind === value ? "" : value });
      return;
    }
    const detailKeys: Partial<Record<MarketFacetKey, string>> = {
      body: "body",
      fuelType: "fuelType",
      transmission: "transmission",
      drivetrain: "drivetrain",
      color: "color",
      assemblyCountry: "assemblyCountry",
      availability: "availability",
      freshness: "seenWithin",
      priceAvailability: "pricePolicy",
      mileageAvailability: "mileagePolicy",
    };
    const detailKey = detailKeys[key];
    if (detailKey) selectDetail(detailKey);
  };

  const quickFilters: QuickFilterOption[] = [
    {
      key: "auction",
      label: "Auction lots",
      active: f.lanes.includes("auction"),
      onToggle: () => set({ lanes: toggle(f.lanes, "auction") }),
    },
    {
      key: "clean-title",
      label: "Clean title",
      active: f.conditions.includes("clean_title"),
      onToggle: () => set({ conditions: toggle(f.conditions, "clean_title") }),
    },
    {
      key: "run-drive",
      label: "Run & drive",
      active: details.runDrive === "yes",
      onToggle: () =>
        setDetail("runDrive", details.runDrive === "yes" ? "" : "yes"),
    },
    {
      key: "buy-now",
      label: "Buy now",
      active: details.buyNow === "1",
      onToggle: () => setDetail("buyNow", details.buyNow === "1" ? "" : "1"),
    },
    {
      key: "seen-today",
      label: "Seen today",
      active: details.seenWithin === "1",
      onToggle: () =>
        setDetail("seenWithin", details.seenWithin === "1" ? "" : "1"),
    },
    {
      key: "photos",
      label: "Has photos",
      active: details.hasPhotos === "yes",
      onToggle: () =>
        setDetail("hasPhotos", details.hasPhotos === "yes" ? "" : "yes"),
    },
    {
      key: "complete-data",
      label: "Price + miles reported",
      active:
        details.pricePolicy === "reported" &&
        details.mileagePolicy === "reported",
      onToggle: () => {
        const value =
          details.pricePolicy === "reported" &&
          details.mileagePolicy === "reported"
            ? ""
            : "reported";
        setPage(0);
        setDetails((current) => ({
          ...current,
          pricePolicy: value,
          mileagePolicy: value,
        }));
      },
    },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-1 sm:gap-4">
      <header className="flex flex-wrap items-center justify-between gap-1.5 border-b border-[var(--b1)] pb-1.5 sm:gap-2 sm:pb-3">
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold text-[var(--t1)] sm:text-xl md:text-3xl">
            Market Explorer
          </h1>
          <p className="mt-1 hidden max-w-2xl text-sm text-[var(--t3)] md:block">
            Search the market, refine the evidence, then inspect the listing.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex h-11 min-w-11 items-center justify-center gap-2 rounded-lg bg-[var(--blue)] px-2.5 text-xs font-semibold text-white sm:px-3"
            onClick={saveCurrentSearch}
          >
            <BookmarkPlus className="h-4 w-4" />
            <span className="hidden sm:inline">Save search</span>
          </button>
          <button
            type="button"
            title="Copy filtered search link"
            aria-label="Copy filtered search link"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs font-semibold"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(window.location.href);
                setCopyStatus("Search link copied");
              } catch {
                setCopyStatus("Could not copy search link");
              }
            }}
          >
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">Copy search</span>
          </button>
          <button
            type="button"
            title="Reset filters"
            aria-label="Reset filters"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs font-semibold"
            onClick={reset}
          >
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">Reset</span>
          </button>
        </div>
        {(copyStatus || saveStatus) && (
          <p role="status" className="w-full text-xs text-[var(--t3)]">
            {saveStatus || copyStatus}
          </p>
        )}
      </header>
      {ready && (
        <MarketLocation
          value={f}
          onChange={set}
          search={{ value: f.q, onChange: (q) => set({ q }) }}
        />
      )}
      <nav
        aria-label="Market workspace"
        className="flex flex-nowrap items-center gap-1 overflow-x-auto rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-1 sm:gap-2 sm:p-2"
      >
        <button
          type="button"
          aria-pressed={!showFilters && !showInsights}
          onClick={() => {
            setShowFilters(false);
            setShowInsights(false);
          }}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)] sm:min-h-10 sm:gap-2 sm:px-3"
        >
          <LayoutGrid className="h-4 w-4" /> Listings
          {!busy && (
            <span className="text-[var(--t4)]">{total.toLocaleString()}</span>
          )}
        </button>
        <button
          type="button"
          aria-expanded={showFilters}
          aria-controls="market-filter-panel"
          disabled={!ready}
          onClick={() => {
            setShowFilters(true);
            setShowInsights(false);
          }}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold aria-expanded:bg-[var(--s2)] aria-expanded:text-[var(--blue)] disabled:opacity-50 sm:min-h-10 sm:gap-2 sm:px-3"
        >
          <SlidersHorizontal className="h-4 w-4" /> Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-[var(--blue)] px-1.5 py-0.5 text-[9px] text-white">
              {activeCount}
            </span>
          )}
        </button>
        <button
          type="button"
          aria-pressed={showInsights}
          onClick={() => {
            setShowFilters(false);
            setShowInsights(true);
          }}
          className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)] sm:min-h-10 sm:gap-2 sm:px-3"
        >
          <BarChart3 className="h-4 w-4" /> Market insights
        </button>
        <p className="ml-auto hidden px-2 text-[10px] text-[var(--t4)] sm:block">
          {busy ? "Updating inventory…" : `${rows.length} shown on this page`}
        </p>
      </nav>
      {activeCount > 0 && (
        <div
          className="hidden flex-wrap items-center gap-2 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-2 sm:flex"
          aria-label="Applied market filters"
        >
          <span className="px-1 text-[10px] font-bold uppercase tracking-wide text-[var(--t4)]">
            Applied
          </span>
          {baseChips.map(([key, value]) => (
            <button
              key={key}
              type="button"
              aria-label={`Remove ${baseLabels[key] || key} filter`}
              className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 text-[11px]"
              onClick={() => set({ [key]: Array.isArray(value) ? [] : "" })}
            >
              <span className="max-w-52 truncate">
                {baseLabels[key] || key}:{" "}
                {Array.isArray(value)
                  ? value
                      .map((entry) => {
                        if (key === "sources")
                          return (
                            INVENTORY_SOURCE_FILTERS.find(
                              (source) => source.id === entry,
                            )?.name || entry
                          );
                        if (key === "categories")
                          return (
                            VEHICLE_CATEGORY_FILTERS[
                              entry as keyof typeof VEHICLE_CATEGORY_FILTERS
                            ]?.label || entry
                          );
                        return entry.replace(/_/g, " ");
                      })
                      .join(", ")
                  : value}
              </span>
              <X className="h-3 w-3 shrink-0" />
            </button>
          ))}
          {INVENTORY_DETAIL_FIELDS.filter((field) => details[field.key]).map(
            (field) => (
              <button
                type="button"
                key={field.key}
                aria-label={`Remove ${field.label} filter`}
                className="inline-flex min-h-9 max-w-full items-center gap-2 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 text-[11px]"
                onClick={() => {
                  setPage(0);
                  setDetails((current) => ({ ...current, [field.key]: "" }));
                }}
              >
                <span className="max-w-52 truncate">
                  {field.label}:{" "}
                  {field.options?.find(
                    (option) => option.value === details[field.key],
                  )?.label || details[field.key]}
                </span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ),
          )}
          <button
            type="button"
            onClick={reset}
            className="ml-auto min-h-9 rounded-lg px-3 text-[11px] font-bold text-[var(--blue)]"
          >
            Clear all
          </button>
        </div>
      )}
      <section
        id="market-filter-panel"
        aria-label="Market filters"
        className={showFilters ? "space-y-4" : "hidden"}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-4">
          <div>
            <h2 className="text-lg font-extrabold">Build one precise search</h2>
            <p className="mt-1 text-xs text-[var(--t3)]">
              Choose live facets first, then use exact controls only when
              needed.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <button
                type="button"
                onClick={reset}
                className="min-h-11 rounded-lg border border-[var(--b1)] px-3 text-xs font-bold"
              >
                Clear {activeCount}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowFilters(false);
                setShowInsights(false);
              }}
              className="min-h-11 rounded-lg bg-[var(--blue)] px-4 text-xs font-bold text-white"
            >
              Show {busy ? "updated" : total.toLocaleString()} listings
            </button>
          </div>
        </div>

        <QuickFilterStrip options={quickFilters} />

        {ready && !error && (
          <MarketFacetStudio
            facets={facets}
            total={total}
            busy={busy}
            selected={{
              make: f.makes,
              model: f.model,
              year:
                f.yearMin && f.yearMin === f.yearMax ? f.yearMin : undefined,
              body: details.body,
              fuelType: details.fuelType,
              transmission: details.transmission,
              drivetrain: details.drivetrain,
              condition: f.conditions,
              source: f.sources,
              color: details.color,
              sellerType: f.sellerTypes,
              assemblyCountry: details.assemblyCountry,
              availability: details.availability,
              freshness: details.seenWithin,
              priceKind: f.priceKind,
              priceAvailability: details.pricePolicy,
              mileageAvailability: details.mileagePolicy,
              priceMin: f.priceMin,
              priceMax: f.priceMax,
              mileageMin: f.minMileage,
              mileageMax: f.mileageMax,
            }}
            onFacetSelect={selectFacet}
            onMatrixSelect={(priceFrom, priceTo, mileageFrom, mileageTo) => {
              const active =
                f.priceMin === String(priceFrom) &&
                f.priceMax === (priceTo == null ? "" : String(priceTo)) &&
                f.minMileage === String(mileageFrom) &&
                f.mileageMax === (mileageTo == null ? "" : String(mileageTo));
              set({
                priceBasis: "advertised",
                priceMin: active ? "" : String(priceFrom),
                priceMax: active || priceTo == null ? "" : String(priceTo),
                minMileage: active ? "" : String(mileageFrom),
                mileageMax:
                  active || mileageTo == null ? "" : String(mileageTo),
              });
            }}
          />
        )}

        <details
          className="group overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s1)]"
          data-testid="exact-market-filters"
        >
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--t1)]">
                Exact filters
              </span>
              <span className="block text-[11px] text-[var(--t4)]">
                Location scope, exact ranges, auction timing and listing
                evidence
              </span>
            </span>
            <span className="shrink-0 rounded-full bg-[var(--s2)] px-2 py-1 text-[10px] font-bold text-[var(--t3)]">
              {activeCount ? `${activeCount} active` : "Optional"}
            </span>
          </summary>
          <div className="space-y-4 border-t border-[var(--b1)] p-3 md:p-4">
            <div className="grid gap-4 xl:grid-cols-3">
              <FilterPanel
                title="Scope & sources"
                description="Where the listing comes from and where it is located."
              >
                {flipDesk && (
                  <div className="flex rounded-lg border border-[var(--b1)] p-1">
                    {(["curated", "all"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={f.mode === mode}
                        onClick={() => set({ mode })}
                        className="flex-1 rounded-md px-3 py-2 text-xs font-bold aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)]"
                      >
                        {mode === "curated" ? "Curated buys" : "Whole market"}
                      </button>
                    ))}
                  </div>
                )}
                <ChipGroup
                  title="Channel"
                  options={LANES.map((lane) => ({
                    key: lane.key,
                    label: lane.label,
                    count: facets.lanes?.[lane.key],
                    color: facets.laneColors?.[lane.key],
                  }))}
                  selected={f.lanes}
                  onToggle={(key) => set({ lanes: toggle(f.lanes, key) })}
                />
                <StateGroup
                  selected={f.states}
                  counts={facets.states || {}}
                  onToggle={(key) =>
                    set({
                      states: toggle(f.states, key),
                      near: "",
                      radius: "",
                      lat: "",
                      lng: "",
                    })
                  }
                  onClear={() => set({ states: [] })}
                />
                <details className="rounded-xl border border-[var(--b1)] px-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold">
                    All indexed sources ({f.sources.length || "Any"})
                  </summary>
                  <label className="mb-2 block text-sm">
                    Find a source or dealer
                    <input
                      type="search"
                      value={sourceSearch}
                      onChange={(event) => setSourceSearch(event.target.value)}
                      placeholder="Dealer name or website"
                      className="mt-1 min-h-11 w-full rounded border border-[var(--b1)] bg-[var(--s0)] px-3 text-base"
                    />
                  </label>
                  <div className="grid max-h-72 grid-cols-2 gap-1 overflow-y-auto pb-3">
                    {matchingSources.length === 0 && (
                      <p
                        role="status"
                        className="col-span-2 py-3 text-sm text-[var(--t3)]"
                      >
                        No matching source.
                      </p>
                    )}
                    {matchingSources.map((source) => (
                      <label
                        key={source.id}
                        className="flex min-h-10 items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          checked={f.sources.includes(source.id)}
                          onChange={() =>
                            set({ sources: toggle(f.sources, source.id) })
                          }
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {source.name}
                        </span>
                        {facets.sources?.find(
                          (entry: { value: string }) =>
                            entry.value === source.id,
                        )?.n != null && (
                          <span className="shrink-0 text-[10px] tabular-nums text-[var(--t4)]">
                            {facets.sources
                              .find(
                                (entry: { value: string }) =>
                                  entry.value === source.id,
                              )!
                              .n.toLocaleString()}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                </details>
              </FilterPanel>

              <FilterPanel
                title="Vehicle precision"
                description="Use exact entries for rare models or multiple makes."
              >
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--t3)]">
                  Makes
                  <input
                    aria-label="Makes"
                    list="market-makes"
                    placeholder="Ford, Toyota"
                    maxLength={250}
                    value={f.makes.join(",")}
                    onChange={(event) =>
                      set({ makes: event.target.value.split(","), model: "" })
                    }
                    className="field min-h-11 !w-full"
                  />
                  <datalist id="market-makes">
                    {Array.from(
                      new Set<string>([
                        ...f.makes,
                        ...(facets.topMakes || []).map(
                          (entry: { make: string }) => entry.make,
                        ),
                      ]),
                    ).map((make) => (
                      <option key={make} value={make} />
                    ))}
                  </datalist>
                </label>
                <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--t3)]">
                  Model
                  <input
                    aria-label="Model"
                    value={f.model}
                    onChange={(event) => set({ model: event.target.value })}
                    maxLength={60}
                    placeholder="Any model"
                    className="field min-h-11 !w-full"
                  />
                </label>
                <details className="rounded-xl border border-[var(--b1)] px-3">
                  <summary className="flex min-h-11 cursor-pointer items-center text-xs font-bold">
                    Vehicle types ({f.categories.length || "Any"})
                  </summary>
                  <div className="grid grid-cols-2 gap-1 pb-3">
                    {Object.entries(VEHICLE_CATEGORY_FILTERS).map(
                      ([key, category]) => (
                        <label
                          key={key}
                          className="flex min-h-10 items-center gap-2 text-xs"
                        >
                          <input
                            type="checkbox"
                            checked={f.categories.includes(key)}
                            onChange={() =>
                              set({ categories: toggle(f.categories, key) })
                            }
                          />
                          {category.label}
                        </label>
                      ),
                    )}
                  </div>
                </details>
                <ChipGroup
                  title="Title / condition"
                  options={CONDITIONS.map((condition) => ({
                    key: condition,
                    label: condition.replace(/_/g, " "),
                  }))}
                  selected={f.conditions}
                  onToggle={(key) =>
                    set({ conditions: toggle(f.conditions, key) })
                  }
                />
              </FilterPanel>

              <FilterPanel
                title="Price, year & economics"
                description="Exact ranges override broad smart-matrix selections."
              >
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--t3)]">
                    Price type
                    <select
                      aria-label="Price type"
                      value={f.priceKind}
                      onChange={(event) =>
                        set({ priceKind: event.target.value })
                      }
                      className="field min-h-11 !w-full"
                    >
                      <option value="">All reported types</option>
                      <option value="asking">Cash asking price</option>
                      <option value="current_bid">Current bid</option>
                      <option value="buy_now">Buy-now price</option>
                      <option value="down_payment">Down payment</option>
                      <option value="monthly_payment">Monthly payment</option>
                      <option value="finance_teaser">Finance teaser</option>
                      <option value="reference">Reference value</option>
                      <option value="unknown">Unverified amount</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-xs font-semibold text-[var(--t3)]">
                    Budget compares
                    <select
                      aria-label="Price comparison basis"
                      value={f.priceBasis}
                      onChange={(event) =>
                        set({ priceBasis: event.target.value })
                      }
                      className="field min-h-11 !w-full"
                    >
                      <option value="cash">Full cash / buy-now</option>
                      <option value="advertised">Advertised amount</option>
                    </select>
                  </label>
                </div>
                <PriceRangeSelector
                  minPrice={f.priceMin}
                  maxPrice={f.priceMax}
                  onMinChange={(value) => set({ priceMin: value })}
                  onMaxChange={(value) => set({ priceMax: value })}
                  onClear={() => set({ priceMin: "", priceMax: "" })}
                />
                <YearRangeSelector
                  minYear={f.yearMin}
                  maxYear={f.yearMax}
                  onMinChange={(value) => set({ yearMin: value })}
                  onMaxChange={(value) => set({ yearMax: value })}
                  onClear={() => set({ yearMin: "", yearMax: "" })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <NumIn
                    ph="miles ≥"
                    v={f.minMileage}
                    on={(value) => set({ minMileage: value })}
                  />
                  <NumIn
                    ph="miles ≤"
                    v={f.mileageMax}
                    on={(value) => set({ mileageMax: value })}
                  />
                  {flipDesk && (
                    <NumIn
                      ph="profit ≥"
                      v={f.minProfit}
                      on={(value) => set({ minProfit: value })}
                      full
                    />
                  )}
                </div>
                {flipDesk && (
                  <>
                    <ChipGroup
                      title="Verdict"
                      options={VERDICTS.map((verdict) => ({
                        key: verdict.key,
                        label: verdict.label,
                      }))}
                      selected={f.verdicts}
                      onToggle={(key) =>
                        set({ verdicts: toggle(f.verdicts, key) })
                      }
                    />
                    <div>
                      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
                        Minimum ROI
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {["", "10", "25", "50", "100"].map((value) => (
                          <button
                            key={value || "any"}
                            type="button"
                            aria-pressed={f.minRoi === value}
                            onClick={() => set({ minRoi: value })}
                            className="min-h-9 rounded-full border border-[var(--b1)] px-3 text-[11px] font-bold aria-pressed:border-[var(--blue)] aria-pressed:text-[var(--blue)]"
                          >
                            {value ? `${value}%+` : "Any"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </FilterPanel>
            </div>

            <div className="rounded-xl border border-[var(--b1)] bg-[var(--s0)] px-4">
              <InventoryDetailFilters
                values={details}
                keys={[
                  "trim",
                  "engine",
                  "damage",
                  "keys",
                  "runDrive",
                  "buyNow",
                  "minBuyNow",
                  "maxBuyNow",
                  "auctionFrom",
                  "auctionTo",
                  "city",
                  "listingZip",
                  "hasVin",
                  "hasPhotos",
                ]}
                onChange={setDetail}
              />
            </div>
          </div>
        </details>

        <div className="sticky bottom-[calc(70px+env(safe-area-inset-bottom))] z-20 flex justify-end rounded-xl border border-[var(--b1)] bg-[var(--s0)]/95 p-3 shadow-lg backdrop-blur lg:bottom-3">
          <button
            type="button"
            onClick={() => {
              setShowFilters(false);
              setShowInsights(false);
            }}
            className="min-h-11 rounded-lg bg-[var(--blue)] px-5 text-sm font-bold text-white"
          >
            Show {busy ? "updated" : total.toLocaleString()} listings
          </button>
        </div>
      </section>

      {!showFilters && showInsights && !busy && !error && (
        <section
          aria-label="Market insights workspace"
          className="space-y-3"
          data-testid="market-intelligence-dashboard"
        >
          <MarketIntelligence
            summary={data?.summary}
            query={qs}
            capped={data?.capped}
          />
          <MarketVisualizers
            facets={facets}
            selectedLanes={f.lanes}
            selectedPrice={{ min: f.priceMin, max: f.priceMax }}
            onLaneToggle={(lane) => set({ lanes: toggle(f.lanes, lane) })}
            onPriceRangeSelect={(from, to) => {
              const alreadySelected =
                f.priceMin === String(from) && f.priceMax === String(to);
              set({
                priceMin: alreadySelected ? "" : String(from),
                priceMax: alreadySelected ? "" : String(to),
              });
            }}
          />
          {flipDesk && (
            <details className="rounded-xl border border-[var(--b1)] bg-[var(--s1)] px-4">
              <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">
                National opportunity map · independent of search filters
              </summary>
              <USHeatmap />
            </details>
          )}
        </section>
      )}

      {!showFilters && !showInsights && (
        <section
          id="market-results"
          aria-label="Market results"
          className="min-w-0 scroll-mt-20"
        >
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--t4)]">
                {error ? (
                  "Market data unavailable"
                ) : busy ? (
                  "Loading…"
                ) : (
                  <>
                    <strong className="text-[var(--t2)]">
                      {total.toLocaleString()}
                    </strong>{" "}
                    {data?.mode === "curated" ? "curated" : "market"} matches
                    {data?.location?.radius
                      ? ` · ${data.location.radius} mi radius`
                      : f.states.length
                        ? ` · ${f.states.length} state${f.states.length > 1 ? "s" : ""}`
                        : " · all states"}
                    {data?.capped ? " · limited inventory sample" : ""}
                  </>
                )}
              </p>
            </div>
            <div aria-label="Result view" className="ml-auto flex gap-1">
              <button
                type="button"
                aria-label="Photo cards"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={`grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] ${view === "grid" ? "bg-[var(--s2)] text-[var(--blue)]" : ""}`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Table view"
                aria-pressed={view === "table"}
                onClick={() => setView("table")}
                className={`grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] ${view === "table" ? "bg-[var(--s2)] text-[var(--blue)]" : ""}`}
              >
                <List className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Toggle results map"
                aria-pressed={showMap}
                onClick={() => setShowMap((current) => !current)}
                className={`grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] ${showMap ? "bg-[var(--s2)] text-[var(--blue)]" : ""}`}
              >
                <MapIcon className="h-4 w-4" />
              </button>
            </div>
            <select
              aria-label="Sort market results"
              value={`${!flipDesk && ["profitEstimate", "profitScore", "sellEstimate"].includes(f.sort) ? "askPrice" : f.sort}:${f.sortDir}`}
              onChange={(e) => {
                const [sort, sortDir] = e.target.value.split(":");
                set({ sort, sortDir: sortDir as "asc" | "desc" });
              }}
              className="field !w-auto text-xs"
            >
              <option value="lastSeenAt:desc">Recently seen</option>
              {(f.near || f.lat) && (
                <option value="distanceMiles:asc">Nearest first</option>
              )}
              {flipDesk && (
                <option value="profitEstimate:desc">Profit ↓</option>
              )}
              {flipDesk && <option value="profitScore:desc">Score ↓</option>}
              <option value="askPrice:asc">Advertised amount ↑</option>
              <option value="askPrice:desc">Advertised amount ↓</option>
              <option value="mileage:asc">Miles ↑</option>
              <option value="year:desc">Year ↓</option>
            </select>
          </div>

          {!busy && !error && (facets.sources?.length || 0) > 0 && (
            <SourceResultStrip
              entries={facets.sources}
              selected={f.sources}
              onSelect={(source) => set({ sources: toggle(f.sources, source) })}
              onClear={() => set({ sources: [] })}
            />
          )}

          {!busy && !error && showMap && rows.length > 0 && (
            <div className="mb-4">
              <MarketResultsMap rows={rows} flipDesk={flipDesk} />
            </div>
          )}
          {error || data?.configured === false ? (
            <ErrorState
              title="Market data unavailable"
              message={
                error?.marketMessage ||
                "Could not load market listings. Your filters have been kept."
              }
              onRetry={() => void mutate()}
            />
          ) : rows.length > 0 ? (
            view === "grid" ? (
              <div
                className="grid gap-4"
                style={{
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(min(100%, 19rem), 1fr))",
                }}
              >
                <MarketReturnPosition />
                {rows.map((row) => (
                  <MarketListingCard
                    key={row.id}
                    row={row}
                    flipDesk={flipDesk}
                  />
                ))}
              </div>
            ) : (
              <DealTable
                rows={rows as TableRow[]}
                flipDesk={flipDesk}
                preserveOrder
              />
            )
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--r3)] py-20 text-center"
              style={{ background: "var(--s1)" }}
            >
              <Ico name="search" size={28} className="text-[var(--t5)]" />
              <p className="text-sm font-bold text-[var(--t2)]">
                {busy ? "Searching…" : "No matches"}
              </p>
              {!busy && (
                <p className="text-xs text-[var(--t4)]">
                  Loosen a filter
                  {flipDesk && f.mode === "curated"
                    ? " or switch to Whole market"
                    : ""}
                  .
                </p>
              )}
            </div>
          )}
          {!busy && !error && (
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--t3)]">
              Indexed inventory reflects the sources and locations collected so
              far. Source availability, photos and prices can change.{" "}
              {data?.capped
                ? "This search reached the 8,000-row sample limit. Narrow location, source or vehicle filters to inspect more precise results."
                : "Open the source listing to confirm availability and the full purchase amount."}
            </p>
          )}
          {!error && !pendingFilters && total > 0 && (
            <nav
              aria-label="Market result pages"
              className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--b1)] pt-3"
            >
              <p role="status" className="text-xs text-[var(--t3)]">
                Page {page + 1} of {Math.max(1, Math.ceil(total / 50))} ·{" "}
                {rows.length} shown
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  aria-label="Previous results page"
                  title="Previous results page"
                  disabled={page === 0 || busy}
                  onClick={() => setPage((current) => Math.max(0, current - 1))}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next results page"
                  title="Next results page"
                  disabled={(page + 1) * 50 >= total || busy}
                  onClick={() => setPage((current) => current + 1)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] disabled:opacity-40"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </nav>
          )}
        </section>
      )}
    </div>
  );
}

// ── small building blocks ──
type QuickFilterOption = {
  key: string;
  label: string;
  active: boolean;
  onToggle: () => void;
};

function QuickFilterStrip({ options }: { options: QuickFilterOption[] }) {
  return (
    <section
      aria-label="Quick market filters"
      className="overflow-hidden rounded-xl border border-[var(--b1)] bg-[var(--s1)]"
    >
      <div className="flex items-center gap-2 overflow-x-auto p-2">
        <span className="shrink-0 px-2 text-[10px] font-bold uppercase tracking-wide text-[var(--t4)]">
          Quick filters
        </span>
        {options.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={option.active}
            onClick={option.onToggle}
            className="min-h-9 shrink-0 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 text-[11px] font-semibold text-[var(--t2)] transition-colors aria-pressed:border-[var(--blue)] aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)]"
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

function SourceResultStrip({
  entries,
  selected,
  onSelect,
  onClear,
}: {
  entries: MarketFacetCount[];
  selected: string[];
  onSelect: (source: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      aria-label="Browse results by source"
      className="mb-3 flex items-center gap-2 overflow-x-auto rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-2"
    >
      <span className="shrink-0 px-2 text-[10px] font-bold uppercase tracking-wide text-[var(--t4)]">
        Sources
      </span>
      <button
        type="button"
        aria-pressed={selected.length === 0}
        onClick={onClear}
        className="min-h-9 shrink-0 rounded-full border border-[var(--b1)] px-3 text-[11px] font-semibold aria-pressed:border-[var(--blue)] aria-pressed:text-[var(--blue)]"
      >
        All
      </button>
      {entries.slice(0, 10).map((entry) => {
        const label =
          INVENTORY_SOURCE_FILTERS.find((source) => source.id === entry.value)
            ?.name || entry.value.replace(/_/g, " ");
        return (
          <button
            key={entry.value}
            type="button"
            aria-pressed={selected.includes(entry.value)}
            onClick={() => onSelect(entry.value)}
            className="min-h-9 shrink-0 rounded-full border border-[var(--b1)] px-3 text-[11px] font-semibold aria-pressed:border-[var(--blue)] aria-pressed:bg-[var(--s2)] aria-pressed:text-[var(--blue)]"
          >
            {label} · {entry.n.toLocaleString()}
          </button>
        );
      })}
    </div>
  );
}

function FilterPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-3 rounded-2xl border border-[var(--b1)] bg-[var(--s1)] p-4">
      <div className="border-b border-[var(--b1)] pb-3">
        <h3 className="text-sm font-extrabold text-[var(--t1)]">{title}</h3>
        <p className="mt-1 text-[10px] leading-relaxed text-[var(--t4)]">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}

function NumIn({
  ph,
  v,
  on,
  full,
}: {
  ph: string;
  v: string;
  on: (v: string) => void;
  full?: boolean;
}) {
  return (
    <input
      aria-label={ph}
      inputMode="numeric"
      placeholder={ph}
      value={v}
      onChange={(e) => on(e.target.value.replace(/[^0-9]/g, ""))}
      className={`field text-xs ${full ? "col-span-2" : ""}`}
    />
  );
}

function ChipGroup({
  title,
  options,
  selected,
  onToggle,
  lowercaseMatch,
}: {
  title: string;
  options: { key: string; label: string; count?: number; color?: string }[];
  selected: string[];
  onToggle: (k: string) => void;
  lowercaseMatch?: boolean;
}) {
  if (!options.length) return null;
  const isOn = (k: string) =>
    lowercaseMatch ? selected.includes(k.toLowerCase()) : selected.includes(k);
  return (
    <div
      className="rounded-[var(--r3)] p-3"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          {title}
        </span>
        {selected.length > 0 && (
          <span
            className="rounded-full px-1.5 text-[9px] font-black text-white"
            style={{ background: "var(--grad)" }}
          >
            {selected.length}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = isOn(o.key);
          return (
            <button
              key={o.key}
              onClick={() =>
                onToggle(lowercaseMatch ? o.key.toLowerCase() : o.key)
              }
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold capitalize transition-all hover:brightness-110 active:scale-95"
              style={
                on
                  ? {
                      background: o.color || "var(--grad)",
                      color: "#fff",
                      boxShadow: `0 0 0 2px ${o.color ? o.color + "44" : "var(--s3)"}`,
                    }
                  : { background: "var(--s2)", color: "var(--t3)" }
              }
            >
              {o.color && (
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: on ? "#fff" : o.color }}
                />
              )}
              {o.label}
              {o.count != null && (
                <span className={on ? "opacity-80" : "opacity-50"}>
                  {o.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StateGroup({
  selected,
  counts,
  onToggle,
  onClear,
}: {
  selected: string[];
  counts: Record<string, number>;
  onToggle: (k: string) => void;
  onClear: () => void;
}) {
  // States with inventory first (by count), then the rest greyed — so the dealer sees where the cars are.
  const withCars = US_STATES.filter((s) => counts[s] > 0).sort(
    (a, b) => counts[b] - counts[a],
  );
  const without = US_STATES.filter((s) => !counts[s]);
  return (
    <details
      open={selected.length > 0 ? true : undefined}
      className="rounded-[var(--r3)] bg-[var(--s1)] px-3"
      style={{ boxShadow: "var(--shadow)" }}
    >
      <summary className="flex min-h-10 cursor-pointer items-center justify-between text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
        <span>States {selected.length ? `(${selected.length})` : ""}</span>
        <span className="text-[9px] font-medium normal-case text-[var(--t5)]">
          {withCars.length} with inventory
        </span>
      </summary>
      {selected.length > 0 && (
        <button
          type="button"
          onClick={onClear}
          className="mb-2 text-[10px] font-bold text-[var(--blue)] hover:text-[var(--t1)]"
        >
          Clear selected states
        </button>
      )}
      <div className="flex flex-wrap gap-1 pb-3">
        {[...withCars, ...without].map((s) => {
          const on = selected.includes(s);
          const has = counts[s] > 0;
          return (
            <button
              key={s}
              onClick={() => onToggle(s)}
              title={has ? `${counts[s]} cars` : "no current inventory"}
              className="rounded px-1.5 py-1 text-[11px] font-bold transition-all"
              style={
                on
                  ? { background: "var(--grad)", color: "#fff" }
                  : {
                      background: "var(--s2)",
                      color: has ? "var(--t2)" : "var(--t5)",
                    }
              }
            >
              {s}
              {has && <span className="ml-1 opacity-60">{counts[s]}</span>}
            </button>
          );
        })}
      </div>
    </details>
  );
}
