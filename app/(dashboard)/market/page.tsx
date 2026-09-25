"use client";

import React from "react";
import useSWR from "swr";
import { DealTable, type TableRow } from "@/components/scan/DealTable";
import { Ico } from "@/components/shared/Ico";
import { USHeatmap } from "@/components/market/USHeatmap";
import { MarketVisualizers } from "@/components/market/MarketVisualizers";

// /market — the advanced sourcing surface. A dealer dials in exactly what they want (states, channel,
// price, year, miles, make, condition, verdict) and flips between CURATED (deals worth acting on) and
// WHOLE MARKET (everything). Every filter shows a live count from the server's facets. Built on the
// shared design tokens so it inherits whatever theme is active.

const fetcher = (u: string) => fetch(u).then((r) => r.json());

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
  conditions: string[];
  verdicts: string[];
  sellerTypes: string[];
  minRoi: string;
  priceMin: string;
  priceMax: string;
  yearMin: string;
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
  conditions: [],
  verdicts: [],
  sellerTypes: [],
  minRoi: "",
  priceMin: "",
  priceMax: "",
  yearMin: "",
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
  const [f, setF] = React.useState<Filters>(EMPTY);
  const set = (patch: Partial<Filters>) => setF((p) => ({ ...p, ...patch }));

  const qs = React.useMemo(() => {
    const p = new URLSearchParams();
    if (f.q.trim()) p.set("q", f.q.trim());
    if (f.states.length) p.set("states", f.states.join(","));
    if (f.lanes.length) p.set("lanes", f.lanes.join(","));
    if (f.makes.length) p.set("makes", f.makes.join(","));
    if (f.conditions.length) p.set("conditions", f.conditions.join(","));
    if (f.verdicts.length) p.set("verdicts", f.verdicts.join(","));
    if (f.sellerTypes.length) p.set("sellerTypes", f.sellerTypes.join(","));
    if (f.minRoi) p.set("minRoi", f.minRoi);
    if (f.priceMin) p.set("priceMin", f.priceMin);
    if (f.priceMax) p.set("priceMax", f.priceMax);
    if (f.yearMin) p.set("yearMin", f.yearMin);
    if (f.mileageMax) p.set("mileageMax", f.mileageMax);
    if (f.minProfit) p.set("minProfit", f.minProfit);
    p.set("mode", f.mode);
    p.set("sort", f.sort);
    p.set("sortDir", f.sortDir);
    p.set("pageSize", "150");
    return p.toString();
  }, [f]);

  const { data, isLoading } = useSWR(`/api/market/explore?${qs}`, fetcher, {
    keepPreviousData: true,
  });

  const rows: TableRow[] = data?.rows || [];
  const facets = data?.facets || {
    states: {},
    lanes: {},
    topMakes: [],
    laneColors: {},
  };
  const total: number = data?.total ?? 0;
  const activeCount =
    f.states.length +
    f.lanes.length +
    f.makes.length +
    f.conditions.length +
    f.verdicts.length +
    f.sellerTypes.length +
    (f.minRoi ? 1 : 0) +
    (f.priceMin ? 1 : 0) +
    (f.priceMax ? 1 : 0) +
    (f.yearMin ? 1 : 0) +
    (f.mileageMax ? 1 : 0) +
    (f.minProfit ? 1 : 0) +
    (f.q.trim() ? 1 : 0);

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Search bar — the fast way in: type a make/model and the whole market filters live. */}
      <div
        className="flex items-center gap-2 rounded-[var(--r3)] px-3.5 py-2.5"
        style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
      >
        <Ico name="search" size={18} className="shrink-0 text-[var(--t4)]" />
        <input
          value={f.q}
          onChange={(e) => set({ q: e.target.value })}
          placeholder="Search make or model — e.g. F-150, Grand Cherokee, Model 3…"
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
      <USHeatmap />
      <div className="flex flex-col gap-4 md:flex-row">
        {/* ── Filter rail ── */}
        <aside className="md:w-72 md:shrink-0 md:sticky md:top-4 md:self-start md:max-h-[calc(100vh-2rem)] md:overflow-y-auto flex flex-col gap-4">
          {/* Curated ⟷ whole market */}
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

          <ChipGroup
            title="Make"
            options={(facets.topMakes || []).map((m: any) => ({
              key: m.make,
              label: m.make,
              count: m.n,
            }))}
            selected={f.makes}
            onToggle={(k) => set({ makes: toggle(f.makes, k) })}
            lowercaseMatch
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

          <ChipGroup
            title="Verdict"
            options={VERDICTS.map((v) => ({ key: v.key, label: v.label }))}
            selected={f.verdicts}
            onToggle={(k) => set({ verdicts: toggle(f.verdicts, k) })}
          />

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

          {/* Numeric ranges */}
          <div
            className="rounded-[var(--r3)] p-3"
            style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
          >
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
              Price / year / miles
            </div>
            <div className="grid grid-cols-2 gap-2">
              <NumIn
                ph="$ min"
                v={f.priceMin}
                on={(v) => set({ priceMin: v })}
              />
              <NumIn
                ph="$ max"
                v={f.priceMax}
                on={(v) => set({ priceMax: v })}
              />
              <NumIn
                ph="year ≥"
                v={f.yearMin}
                on={(v) => set({ yearMin: v })}
              />
              <NumIn
                ph="miles ≤"
                v={f.mileageMax}
                on={(v) => set({ mileageMax: v })}
              />
              <NumIn
                ph="profit ≥"
                v={f.minProfit}
                on={(v) => set({ minProfit: v })}
                full
              />
            </div>
          </div>

          {activeCount > 0 && (
            <button
              onClick={() => set({ ...EMPTY, mode: f.mode })}
              className="rounded-[var(--r2)] px-3 py-2 text-xs font-bold text-[var(--t3)] transition-colors hover:text-[var(--t1)]"
              style={{ background: "var(--s1)" }}
            >
              Clear {activeCount} filter{activeCount > 1 ? "s" : ""}
            </button>
          )}
        </aside>

        {/* ── Results ── */}
        <main className="min-w-0 flex-1">
          <MarketVisualizers facets={facets} />

          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-black text-[var(--t1)]">
                Market sourcing
              </h1>
              <p className="text-xs text-[var(--t4)]">
                {isLoading && !data ? (
                  "Loading…"
                ) : (
                  <>
                    <strong className="text-[var(--t2)]">
                      {total.toLocaleString()}
                    </strong>{" "}
                    {f.mode === "curated" ? "curated" : "market"} matches
                    {f.states.length
                      ? ` · ${f.states.length} state${f.states.length > 1 ? "s" : ""}`
                      : " · all states"}
                    {data?.capped ? " · refine to see all" : ""}
                  </>
                )}
              </p>
            </div>
            <select
              value={`${f.sort}:${f.sortDir}`}
              onChange={(e) => {
                const [sort, sortDir] = e.target.value.split(":");
                set({ sort, sortDir: sortDir as "asc" | "desc" });
              }}
              className="field !w-auto text-xs"
            >
              <option value="profitEstimate:desc">Profit ↓</option>
              <option value="profitScore:desc">Score ↓</option>
              <option value="askPrice:asc">Price ↑</option>
              <option value="askPrice:desc">Price ↓</option>
              <option value="mileage:asc">Miles ↑</option>
              <option value="year:desc">Year ↓</option>
            </select>
          </div>

          {rows.length > 0 ? (
            <DealTable rows={rows} />
          ) : (
            <div
              className="flex flex-col items-center justify-center gap-2 rounded-[var(--r3)] py-20 text-center"
              style={{ background: "var(--s1)" }}
            >
              <Ico name="search" size={28} className="text-[var(--t5)]" />
              <p className="text-sm font-bold text-[var(--t2)]">
                {isLoading ? "Searching…" : "No matches"}
              </p>
              {!isLoading && (
                <p className="text-xs text-[var(--t4)]">
                  Loosen a filter
                  {f.mode === "curated" ? " or switch to Whole market" : ""}.
                </p>
              )}
            </div>
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
