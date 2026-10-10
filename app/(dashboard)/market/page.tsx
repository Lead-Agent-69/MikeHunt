"use client";

import React from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr-config";
import { ErrorState } from "@/components/shared/ErrorState";
import { DealTable, type TableRow } from "@/components/scan/DealTable";
import { Ico } from "@/components/shared/Ico";
import { USHeatmap } from "@/components/market/USHeatmap";
import { MarketVisualizers } from "@/components/market/MarketVisualizers";
import { InventoryDetailFilters } from "@/components/search/InventoryDetailFilters";
import {
  readInventoryDetails,
  INVENTORY_DETAIL_FIELDS,
} from "@/lib/search/extended-inventory-filters";
import {
  INVENTORY_SOURCE_FILTERS,
  VEHICLE_CATEGORY_FILTERS,
} from "@/lib/search/inventory-filters";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  RotateCcw,
  Filter,
  X,
} from "lucide-react";
import { useDebouncedValue } from "@/components/ui/performance-optimizations";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import {
  PriceRangeSelector,
  YearRangeSelector,
} from "@/components/shared/PriceRangeSelector";

// /market — the advanced sourcing surface. A dealer dials in exactly what they want (states, channel,
// price, year, miles, make, condition, verdict) and flips between CURATED (deals worth acting on) and
// WHOLE MARKET (everything). Every filter shows a live count from the server's facets. Built on the
// shared design tokens so it inherits whatever theme is active.

// prettier-ignore
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

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
  { key: "go", label: "BUY" },
  { key: "hold", label: "Hold" },
  { key: "pass", label: "Pass" },
];

type Filters = {
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
  mode: "curated",
  sort: "profitEstimate",
  sortDir: "desc",
};

const SELLERS = [
  { key: "dealer", label: "Dealer" },
  { key: "auction", label: "Auction" },
  { key: "private", label: "Private" },
];

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export default function MarketPage() {
  const { intent } = useBuyerIntent();
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
  const [f, setF] = React.useState<Filters>(EMPTY);
  const [details, setDetails] = React.useState<Record<string, string>>({});
  const [page, setPage] = React.useState(0);
  const [ready, setReady] = React.useState(false);
  const [copyStatus, setCopyStatus] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const set = (patch: Partial<Filters>) => {
    setPage(0);
    setF((p) => ({ ...p, ...patch }));
  };
  const reset = () => {
    setPage(0);
    setF(EMPTY);
    setDetails({});
  };
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...EMPTY };
    for (const key of Object.keys(EMPTY) as (keyof Filters)[]) {
      const value = params.get(key);
      if (value == null) continue;
      if (Array.isArray(EMPTY[key]))
        (next as any)[key] = value.split(",").filter(Boolean);
      else (next as any)[key] = value;
    }
    next.mode = next.mode === "all" ? "all" : "curated";
    next.sortDir = next.sortDir === "asc" ? "asc" : "desc";
    if (
      ![
        "askPrice",
        "profitEstimate",
        "profitScore",
        "sellEstimate",
        "mileage",
        "year",
      ].includes(next.sort)
    )
      next.sort = EMPTY.sort;
    setF(next);
    setDetails(readInventoryDetails(params));
    setPage(Math.max(0, Math.floor(Number(params.get("page")) || 0)));
    setReady(true);
  }, []);

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
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
  const pendingFilters = !ready || qs !== debouncedQs;
  React.useEffect(() => {
    if (ready) window.history.replaceState(null, "", `/market?${qs}`);
  }, [qs, ready]);

  const { data, error, isLoading, mutate } = useSWR(
    !pendingFilters ? `/api/market/explore?${debouncedQs}` : null,
    fetcher,
    {
      keepPreviousData: false,
    },
  );

  const rows: TableRow[] = pendingFilters ? [] : data?.rows || [];
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
      !["sort", "sortDir", "mode"].includes(key) &&
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
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] pb-3">
        <h1 className="text-xl font-bold text-[var(--t1)]">Market sourcing</h1>
        <div className="flex gap-2">
          <button
            type="button"
            title="Copy filtered search link"
            aria-label="Copy filtered search link"
            className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)]"
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
          </button>
          <button
            type="button"
            title="Reset filters"
            aria-label="Reset filters"
            className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)]"
            onClick={reset}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        {copyStatus && (
          <p role="status" className="w-full text-xs text-[var(--t3)]">
            {copyStatus}
          </p>
        )}
      </header>
      {baseChips.length > 0 && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Applied inventory filters"
        >
          {baseChips.map(([key, value]) => (
            <button
              key={key}
              type="button"
              aria-label={`Remove ${baseLabels[key] || key} filter`}
              className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs"
              onClick={() => set({ [key]: Array.isArray(value) ? [] : "" })}
            >
              <span className="break-words">
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
        </div>
      )}
      {Object.entries(details).some(([, value]) => value) && (
        <div
          className="flex flex-wrap gap-2"
          aria-label="Applied detail filters"
        >
          {INVENTORY_DETAIL_FIELDS.filter((field) => details[field.key]).map(
            (field) => (
              <button
                type="button"
                key={field.key}
                aria-label={`Remove ${field.label} filter`}
                className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs"
                onClick={() => {
                  setPage(0);
                  setDetails((current) => ({ ...current, [field.key]: "" }));
                }}
              >
                <span className="break-words">
                  {field.label}:{" "}
                  {field.options?.find(
                    (option) => option.value === details[field.key],
                  )?.label || details[field.key]}
                </span>
                <X className="h-3 w-3 shrink-0" />
              </button>
            ),
          )}
        </div>
      )}
      {/* Search bar — the fast way in: type a make/model and the whole market filters live. */}
      <div
        className="flex items-center gap-2 rounded-[var(--r3)] px-3.5 py-2.5"
        style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
      >
        <Ico name="search" size={18} className="shrink-0 text-[var(--t4)]" />
        <input
          aria-label="Search make, model or VIN"
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Make, model or VIN"
          className="w-full bg-transparent text-[15px] font-medium text-[var(--t1)] outline-none placeholder:text-[var(--t4)]"
        />
        {f.q && (
          <button
            onClick={() => set({ q: "" })}
            className="shrink-0 text-[var(--t4)] transition-colors hover:text-[var(--t1)]"
            title="Clear search"
          >
            <Ico name="close" size={16} />
          </button>
        )}
      </div>

      {/* Whole-country opportunity heatmap — where the GO/HOLD money clusters. */}
      {flipDesk && <USHeatmap />}
      <button
        type="button"
        aria-expanded={showFilters}
        aria-controls="market-filter-panel"
        onClick={() => setShowFilters((current) => !current)}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-[var(--b1)] px-3 text-sm md:hidden"
      >
        <Filter className="h-4 w-4" /> Filters{" "}
        {activeCount > 0 && `(${activeCount})`}
      </button>
      <div className="flex flex-col gap-4 md:flex-row">
        {/* ── Filter rail ── */}
        <aside
          id="market-filter-panel"
          className={`${showFilters ? "flex" : "hidden"} md:flex md:w-72 md:shrink-0 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-2rem)] md:overflow-y-auto flex-col gap-4`}
        >
          {/* Curated ⟷ whole market */}
          {flipDesk && (
            <div
              className="flex rounded-[var(--r2)] p-1"
              style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
            >
              {(["curated", "all"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => set({ mode: m })}
                  className="flex-1 rounded-[var(--r1)] px-3 py-2 text-xs font-bold uppercase tracking-wide transition-all"
                  style={
                    f.mode === m
                      ? { background: "var(--grad)", color: "#fff" }
                      : { color: "var(--t4)" }
                  }
                >
                  {m === "curated" ? "Curated" : "Whole market"}
                </button>
              ))}
            </div>
          )}

          <ChipGroup
            title="Channel"
            options={LANES.map((l) => ({
              key: l.key,
              label: l.label,
              count: facets.lanes?.[l.key],
              color: facets.laneColors?.[l.key],
            }))}
            selected={f.lanes}
            onToggle={(k) => set({ lanes: toggle(f.lanes, k) })}
          />

          <StateGroup
            selected={f.states}
            counts={facets.states || {}}
            onToggle={(k) => set({ states: toggle(f.states, k) })}
            onClear={() => set({ states: [] })}
          />

          <fieldset className="min-w-0 space-y-3 border-t border-[var(--b1)] pt-3">
            <legend className="text-xs font-bold text-[var(--t3)]">
              Vehicle & sources
            </legend>
            <label className="flex flex-col gap-1 text-xs text-[var(--t3)]">
              Makes
              <input
                aria-label="Makes"
                list="market-makes"
                placeholder="Any make"
                maxLength={250}
                value={f.makes.join(",")}
                onChange={(event) =>
                  set({
                    makes: event.target.value.split(","),
                    model: "",
                  })
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
                  <option key={make} value={make}>
                    {make}
                  </option>
                ))}
              </datalist>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[var(--t3)]">
              Model
              <input
                aria-label="Model"
                value={f.model}
                onChange={(event) => set({ model: event.target.value })}
                maxLength={60}
                className="field min-h-11 !w-full"
              />
            </label>
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                Vehicle types ({f.categories.length || "Any"})
              </summary>
              <div className="space-y-1">
                {Object.entries(VEHICLE_CATEGORY_FILTERS).map(
                  ([key, category]) => (
                    <label
                      key={key}
                      className="flex min-h-11 items-center gap-2 text-sm"
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
            <details>
              <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">
                Sources ({f.sources.length || "All"})
              </summary>
              <div className="max-h-64 overflow-y-auto">
                {INVENTORY_SOURCE_FILTERS.map((source) => (
                  <label
                    key={source.id}
                    className="flex min-h-11 items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={f.sources.includes(source.id)}
                      onChange={() =>
                        set({ sources: toggle(f.sources, source.id) })
                      }
                    />
                    {source.name}
                  </label>
                ))}
              </div>
            </details>
          </fieldset>
          <InventoryDetailFilters
            compact
            values={details}
            onChange={(key, value) => {
              setPage(0);
              setDetails((current) => ({ ...current, [key]: value }));
            }}
          />

          <ChipGroup
            title="Title / condition"
            options={CONDITIONS.map((c) => ({
              key: c,
              label: c.replace(/_/g, " "),
            }))}
            selected={f.conditions}
            onToggle={(k) => set({ conditions: toggle(f.conditions, k) })}
          />

          {flipDesk && (
            <ChipGroup
              title="Verdict"
              options={VERDICTS.map((v) => ({ key: v.key, label: v.label }))}
              selected={f.verdicts}
              onToggle={(k) => set({ verdicts: toggle(f.verdicts, k) })}
            />
          )}

          <ChipGroup
            title="Seller type"
            options={SELLERS.map((s) => ({
              key: s.key,
              label: s.label,
              count: facets.sellerTypes?.[s.key],
            }))}
            selected={f.sellerTypes}
            onToggle={(k) => set({ sellerTypes: toggle(f.sellerTypes, k) })}
          />

          {/* Min ROI — chop low-yield flips fast (Visor-style) */}
          {flipDesk && (
            <div
              className="rounded-[var(--r3)] p-3"
              style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
            >
              <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
                Min ROI
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["", "10", "25", "50", "100"].map((v) => (
                  <button
                    key={v || "any"}
                    onClick={() => set({ minRoi: v })}
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold transition-all"
                    style={
                      f.minRoi === v
                        ? { background: "var(--grad)", color: "#fff" }
                        : { background: "var(--s2)", color: "var(--t3)" }
                    }
                  >
                    {v ? `${v}%+` : "Any"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Enhanced Price Range Selector */}
          <PriceRangeSelector
            minPrice={f.priceMin}
            maxPrice={f.priceMax}
            onMinChange={(v) => set({ priceMin: v })}
            onMaxChange={(v) => set({ priceMax: v })}
            onClear={() => set({ priceMin: "", priceMax: "" })}
          />

          {/* Enhanced Year Range Selector */}
          <YearRangeSelector
            minYear={f.yearMin}
            maxYear={f.yearMax}
            onMinChange={(v) => set({ yearMin: v })}
            onMaxChange={(v) => set({ yearMax: v })}
            onClear={() => set({ yearMin: "", yearMax: "" })}
          />

          {/* Miles and Profit - Keep existing simple inputs */}
          <div
            className="rounded-[var(--r3)] p-3"
            style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
              Miles / profit
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumIn
                ph="miles ≥"
                v={f.minMileage}
                on={(v) => set({ minMileage: v })}
              />
              <NumIn
                ph="miles ≤"
                v={f.mileageMax}
                on={(v) => set({ mileageMax: v })}
              />
              {flipDesk && (
                <NumIn
                  ph="profit ≥"
                  v={f.minProfit}
                  on={(v) => set({ minProfit: v })}
                  full
                />
              )}
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={reset}
              className="rounded-[var(--r2)] px-3 py-2 text-xs font-bold text-[var(--t3)] transition-colors hover:text-[var(--t1)]"
              style={{ background: "var(--s1)" }}
            >
              Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
            </button>
          )}
        </aside>

        {/* ── Results ── */}
        <main className="min-w-0 flex-1">
          {!error && <MarketVisualizers facets={facets} />}

          <div className="mb-3 flex items-center justify-between gap-3">
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
                    {f.states.length
                      ? ` · ${f.states.length} state${f.states.length > 1 ? "s" : ""}`
                      : " · all states"}
                    {data?.capped ? " · limited inventory sample" : ""}
                  </>
                )}
              </p>
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
              {flipDesk && (
                <option value="profitEstimate:desc">Profit ↓</option>
              )}
              {flipDesk && <option value="profitScore:desc">Score ↓</option>}
              <option value="askPrice:asc">Price ↑</option>
              <option value="askPrice:desc">Price ↓</option>
              <option value="mileage:asc">Miles ↑</option>
              <option value="year:desc">Year ↓</option>
            </select>
          </div>

          {error ? (
            <ErrorState
              title="Market data unavailable"
              message="Could not load market listings. Your filters have been kept."
              onRetry={() => void mutate()}
            />
          ) : rows.length > 0 ? (
            <DealTable rows={rows} />
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
        </main>
      </div>
    </div>
  );
}

// ── small building blocks ──
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
    <div
      className="rounded-[var(--r3)] p-3"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
          State {selected.length ? `(${selected.length})` : ""}
        </span>
        {selected.length > 0 && (
          <button
            onClick={onClear}
            className="text-[10px] font-bold text-[var(--t4)] hover:text-[var(--t1)]"
          >
            clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
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
    </div>
  );
}
