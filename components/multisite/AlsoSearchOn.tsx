"use client";

import { useMemo, useState } from "react";
import { buildMultiSiteLinks } from "@/lib/multisite";
import type { MultiSiteFilters } from "@/lib/multisite";

// "Also search on": one set of filters, opened on other sites' own search pages.
// These are plain links to each site's public search URL. We don't fetch or scrape them.
// Carvana and Visor are left out on purpose (their terms don't allow it).

const FIELD =
  "min-h-[40px] w-full rounded-lg border border-[var(--b2)] bg-[var(--s2)] px-3 text-sm text-[var(--t1)] placeholder:text-[var(--t4)]";

const num = (v: string) => {
  const n = Number(v.replace(/[^\d]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

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

  const links = useMemo(() => {
    if (!make.trim()) return [];
    return buildMultiSiteLinks({
      make: make.trim(),
      model: model.trim() || undefined,
      yearMin: num(yearMin),
      yearMax: num(yearMax),
      priceMax: num(priceMax),
      zip: /^\d{5}$/.test(zip) ? zip : undefined,
      radiusMi: num(radius),
    });
  }, [make, model, yearMin, yearMax, priceMax, zip, radius]);

  return (
    <section className="glass-panel p-4 md:p-5" data-testid="also-search-on">
      <h2 className="text-base font-bold text-[var(--t1)]">Also search on</h2>
      <p className="mt-1 text-xs text-[var(--t4)]">
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
                className="inline-flex min-h-[40px] items-center rounded-full border border-[var(--b2)] bg-[var(--s2)] px-3 text-sm font-semibold text-[var(--t1)] hover:border-[var(--green)]"
                title={
                  l.dropped.length
                    ? `Set ${l.dropped.join(", ")} on ${l.label} — its link can't carry it`
                    : `Open on ${l.label}`
                }
              >
                {l.label}
                {l.dropped.length ? (
                  <span className="ml-1 text-xs font-normal text-[var(--t4)]">
                    *
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-[var(--t4)]">
          Enter a make to get links.
        </p>
      )}
      {links.some((l) => l.dropped.length) ? (
        <p className="mt-2 text-[11px] text-[var(--t4)]">
          * That site&apos;s link can&apos;t carry every filter. Hover to see
          which ones to set there.
        </p>
      ) : null}
    </section>
  );
}
