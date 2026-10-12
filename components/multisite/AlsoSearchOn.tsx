"use client";

import { useId, useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import { buildMultiSiteLinks } from "@/lib/multisite";
import type { MultiSiteFilters } from "@/lib/multisite";

// Plain names for the filters a site's link can't carry (shown as text, not a hover tooltip).
export const FILTER_NAMES: Record<keyof MultiSiteFilters, string> = {
  make: "make",
  model: "model",
  yearMin: "year from",
  yearMax: "year to",
  priceMin: "min price",
  priceMax: "max price",
  milesMax: "max miles",
  zip: "ZIP",
  radiusMi: "radius",
  title: "title",
  trim: "trim",
  body: "body",
  drivetrain: "drivetrain",
  fuel: "fuel",
  transmission: "transmission",
};

// "Also search on": one set of filters, opened on other sites' own search pages.
// These are plain links to each site's public search URL. We don't fetch or scrape them.
// Carvana and Visor are left out on purpose (their terms don't allow it).

const FIELD =
  "min-h-11 w-full rounded-lg border border-[var(--b2)] bg-[var(--s2)] px-3 text-sm text-[var(--t1)] placeholder:text-[var(--t4)]";

const num = (v: string) => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

const TITLE_OPTS = [
  ["clean", "Clean title"],
  ["salvage", "Salvage title"],
  ["rebuilt", "Rebuilt title"],
] as const;
const BODY_OPTS = [
  ["sedan", "Sedan"],
  ["suv", "SUV"],
  ["truck", "Truck"],
  ["coupe", "Coupe"],
  ["hatchback", "Hatchback"],
  ["minivan", "Minivan"],
  ["van", "Van"],
  ["wagon", "Wagon"],
  ["convertible", "Convertible"],
] as const;
const DRIVE_OPTS = [
  ["awd", "AWD"],
  ["4wd", "4WD"],
  ["fwd", "FWD"],
  ["rwd", "RWD"],
] as const;
const FUEL_OPTS = [
  ["gas", "Gas"],
  ["diesel", "Diesel"],
  ["hybrid", "Hybrid"],
  ["plugin_hybrid", "Plug-in hybrid"],
  ["electric", "Electric"],
] as const;
const TRANS_OPTS = [
  ["automatic", "Automatic"],
  ["manual", "Manual"],
] as const;

export function AlsoSearchOn({
  initial,
}: {
  initial?: Partial<MultiSiteFilters>;
}) {
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [yearMin, setYearMin] = useState(
    initial?.yearMin ? String(initial.yearMin) : "",
  );
  const [yearMax, setYearMax] = useState(
    initial?.yearMax ? String(initial.yearMax) : "",
  );
  const [priceMax, setPriceMax] = useState(
    initial?.priceMax ? String(initial.priceMax) : "",
  );
  const [zip, setZip] = useState(initial?.zip ?? "");
  const [radius, setRadius] = useState(
    initial?.radiusMi ? String(initial.radiusMi) : "50",
  );
  // "More filters": closed by default so the first glance stays make / model / price / ZIP.
  const [trim, setTrim] = useState(initial?.trim ?? "");
  const [priceMin, setPriceMin] = useState(
    initial?.priceMin ? String(initial.priceMin) : "",
  );
  const [milesMax, setMilesMax] = useState(
    initial?.milesMax ? String(initial.milesMax) : "",
  );
  const [title, setTitle] = useState<string>(initial?.title ?? "");
  const [body, setBody] = useState<string>(initial?.body ?? "");
  const [drivetrain, setDrivetrain] = useState<string>(
    initial?.drivetrain ?? "",
  );
  const [fuel, setFuel] = useState<string>(initial?.fuel ?? "");
  const [transmission, setTransmission] = useState<string>(
    initial?.transmission ?? "",
  );
  const [moreOpen, setMoreOpen] = useState(false);
  const moreId = useId();
  const moreSet = [
    trim,
    priceMin,
    milesMax,
    title,
    body,
    drivetrain,
    fuel,
    transmission,
  ].filter((v) => v.trim()).length;

  const links = useMemo(() => {
    if (!make.trim()) return [];
    return buildMultiSiteLinks({
      make: make.trim(),
      model: model.trim() || undefined,
      yearMin: num(yearMin),
      yearMax: num(yearMax),
      priceMin: num(priceMin),
      priceMax: num(priceMax),
      milesMax: num(milesMax),
      zip: /^\d{5}$/.test(zip) ? zip : undefined,
      radiusMi: num(radius),
      trim: trim.trim() || undefined,
      title: title || undefined,
      body: body || undefined,
      drivetrain: drivetrain || undefined,
      fuel: fuel || undefined,
      transmission: transmission || undefined,
    });
  }, [
    make,
    model,
    yearMin,
    yearMax,
    priceMin,
    priceMax,
    milesMax,
    zip,
    radius,
    trim,
    title,
    body,
    drivetrain,
    fuel,
    transmission,
  ]);

  return (
    <section className="glass-panel p-4 md:p-5" data-testid="also-search-on">
      <h2 className="text-base font-bold text-[var(--t1)]">Also search on</h2>
      <p className="mt-1 text-xs text-[var(--t3)]">
        Set your search once, then open it on other sites in a new tab.
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-7">
        <input
          aria-label="Make"
          placeholder="Make"
          value={make}
          onChange={(e) => setMake(e.target.value)}
          className={FIELD}
        />
        <input
          aria-label="Model"
          placeholder="Model"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          className={FIELD}
        />
        <input
          aria-label="Year from"
          placeholder="Year from"
          inputMode="numeric"
          value={yearMin}
          onChange={(e) => setYearMin(e.target.value)}
          className={FIELD}
        />
        <input
          aria-label="Year to"
          placeholder="Year to"
          inputMode="numeric"
          value={yearMax}
          onChange={(e) => setYearMax(e.target.value)}
          className={FIELD}
        />
        <input
          aria-label="Max price"
          placeholder="Max price"
          inputMode="numeric"
          value={priceMax}
          onChange={(e) => setPriceMax(e.target.value)}
          className={FIELD}
        />
        <input
          aria-label="ZIP"
          placeholder="ZIP"
          inputMode="numeric"
          maxLength={5}
          value={zip}
          onChange={(e) => setZip(e.target.value)}
          className={FIELD}
        />
        <select
          aria-label="Radius"
          value={radius}
          onChange={(e) => setRadius(e.target.value)}
          className={FIELD}
        >
          {[25, 50, 100, 200, 500].map((r) => (
            <option key={r} value={r}>
              {r} mi
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2" data-testid="also-search-on-more">
        <button
          type="button"
          aria-expanded={moreOpen}
          aria-controls={moreId}
          onClick={() => setMoreOpen((o) => !o)}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-[var(--t2)]"
        >
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${moreOpen ? "rotate-90" : ""}`}
          >
            ›
          </span>
          More filters
          {moreSet ? (
            <span className="text-[var(--t3)]">({moreSet} set)</span>
          ) : null}
        </button>
        {/* Tailwind 3's [hidden] rule loses to .grid, so the display class toggles too. */}
        <div
          id={moreId}
          hidden={!moreOpen}
          className={`mt-2 grid-cols-2 gap-2 md:grid-cols-4 ${moreOpen ? "grid" : "hidden"}`}
        >
          <input
            aria-label="Trim"
            placeholder="Trim"
            value={trim}
            onChange={(e) => setTrim(e.target.value)}
            className={FIELD}
          />
          <input
            aria-label="Min price"
            placeholder="Min price"
            inputMode="numeric"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className={FIELD}
          />
          <input
            aria-label="Max miles"
            placeholder="Max miles"
            inputMode="numeric"
            value={milesMax}
            onChange={(e) => setMilesMax(e.target.value)}
            className={FIELD}
          />
          {(
            [
              ["Title", title, setTitle, TITLE_OPTS],
              ["Body", body, setBody, BODY_OPTS],
              ["Drivetrain", drivetrain, setDrivetrain, DRIVE_OPTS],
              ["Fuel", fuel, setFuel, FUEL_OPTS],
              ["Transmission", transmission, setTransmission, TRANS_OPTS],
            ] as const
          ).map(([label, value, set, opts]) => (
            <select
              key={label}
              aria-label={label}
              value={value}
              onChange={(e) => set(e.target.value)}
              className={FIELD}
            >
              <option value="">Any {label.toLowerCase()}</option>
              {opts.map(([v, text]) => (
                <option key={v} value={v}>
                  {text}
                </option>
              ))}
            </select>
          ))}
        </div>
      </div>
      {links.length ? (
        <ul
          className="mt-3 flex flex-wrap gap-2"
          data-testid="also-search-on-links"
        >
          {links.map((l) => (
            <li key={l.site}>
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-[var(--b2)] bg-[var(--s2)] px-4 text-sm font-semibold text-[var(--t1)] hover:border-[var(--green)]"
              >
                {l.label}
                {l.dropped.length ? (
                  <span
                    aria-hidden="true"
                    className="text-xs font-normal text-[var(--t3)]"
                  >
                    *
                  </span>
                ) : null}
                <ExternalLink
                  size={14}
                  aria-hidden="true"
                  className="text-[var(--t3)]"
                />
                <span className="sr-only">
                  {l.dropped.length
                    ? ` (opens in a new tab; set ${l.dropped.map((d) => FILTER_NAMES[d]).join(", ")} there)`
                    : " (opens in a new tab)"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--t3)]">
          Enter a make to get links.
        </p>
      )}
      {links.some((l) => l.dropped.length) ? (
        <div
          className="mt-2 text-xs text-[var(--t3)]"
          data-testid="also-search-on-dropped"
          aria-hidden="true"
        >
          <p>* Their link can&apos;t carry every filter. Set these there:</p>
          <ul className="mt-0.5 space-y-0.5">
            {links
              .filter((l) => l.dropped.length)
              .map((l) => (
                <li key={l.site}>
                  {l.label}: {l.dropped.map((d) => FILTER_NAMES[d]).join(", ")}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
