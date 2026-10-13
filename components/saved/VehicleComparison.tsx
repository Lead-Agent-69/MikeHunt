"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
} from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/ErrorState";
import { sourceMeta } from "@/lib/sources/source-meta";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import { needsOperabilityFacts } from "@/lib/deals/condition-display";

type Candidate = {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number;
  buyNowPrice?: number;
  buy_now_price?: number;
  priceEvidence?: PriceEvidence;
  title?: string;
  mileage?: number;
  condition?: string;
  lastSeenAt?: string;
  active?: boolean;
  auctionEndAt?: string;
  source?: string;
  sourceUrl?: string;
  images?: string[];
  locationCity?: string;
  locationState?: string;
  vin?: string;
  damageType?: string;
  runAndDrive?: boolean;
  hasKeys?: boolean;
  dealAnalysis?: { costs?: { repair?: number; transport?: number } };
};

const money = (value?: number) =>
  value == null || !Number.isFinite(value) || value < 0
    ? "Not confirmed"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);

export function VehicleComparison({ ids }: { ids: string[] }) {
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [overflows, setOverflows] = useState(false);
  const comparisonRef = useRef<HTMLDivElement>(null);
  const key = ids.slice(0, 4).join(",");
  const {
    data: result,
    error,
    isLoading,
    mutate,
  } = useSWR<{ cars: Candidate[]; failed: number }>(
    key ? ["candidate-comparison", key] : null,
    async () => {
      const results = await Promise.allSettled(
          key.split(",").map(async (id) => {
            const response = await fetch(
              `/api/deals/${encodeURIComponent(id)}`,
            );
            if (!response.ok)
              throw new Error("A selected vehicle could not be loaded.");
            const body = await response.json();
            if (!body.deal)
              throw new Error("A selected vehicle is unavailable.");
            return body.deal;
          }),
        ),
        cars = results.flatMap((result) =>
          result.status === "fulfilled" ? [result.value as Candidate] : [],
        );
      if (!cars.length)
        throw new Error("Selected vehicles couldn't be loaded.");
      return { cars, failed: results.length - cars.length };
    },
    { revalidateOnFocus: false },
  );
  const data = result?.cars;
  useLayoutEffect(() => {
    const region = comparisonRef.current;
    if (!region) return;
    const measure = () =>
      setOverflows(region.scrollWidth > region.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(region);
    return () => observer.disconnect();
  }, [data, error, isLoading]);

  if (isLoading) return <p role="status">Loading selected vehicles...</p>;
  if (error)
    return (
      <ErrorState
        title="Couldn't compare these vehicles"
        message="One of the selected vehicles could not be loaded. Your saves are unchanged."
        onRetry={() => void mutate()}
      />
    );
  if (!data?.length)
    return (
      <p className="text-[var(--t3)]">
        Select two to four vehicles in{" "}
        <Link className="text-[var(--blue)] underline" href="/saved">
          Saved
        </Link>{" "}
        to compare them.
      </p>
    );

  const prices = new Map(
    data.map((candidate) => [
      candidate.id,
      sourcePriceContext({
        source: candidate.source,
        source_url: candidate.sourceUrl,
        ask_price: candidate.askPrice,
        buy_now_price: candidate.buyNowPrice ?? candidate.buy_now_price,
        price_evidence: candidate.priceEvidence,
        title: candidate.title,
        last_seen_at: candidate.lastSeenAt,
        condition: candidate.condition,
        damage_type: candidate.damageType,
        mileage: candidate.mileage,
        auction_end_at: candidate.auctionEndAt,
      }),
    ]),
  );
  const selectedIndex = Math.max(
    0,
    data.findIndex((candidate) => candidate.id === selectedId),
  );
  function showColumn(index: number) {
    const region = comparisonRef.current;
    const column = region?.querySelectorAll<HTMLTableCellElement>(
      'thead th[scope="col"]',
    )[index];
    if (!region || !column || !data?.[index]) return;
    setSelectedId(data[index].id);
    const labelWidth = region
      .querySelector("thead th")!
      .getBoundingClientRect().width;
    region.scrollTo({
      left: Math.max(
        0,
        column.getBoundingClientRect().left -
          region.getBoundingClientRect().left +
          region.scrollLeft -
          labelWidth,
      ),
      behavior: "instant",
    });
  }
  const rows: {
    label: string;
    value: (candidate: Candidate) => string;
    visible?: boolean;
  }[] = [
    { label: "Price type", value: (c) => prices.get(c.id)!.label },
    {
      label: "Reported amount",
      value: (c) =>
        prices.get(c.id)!.amount != null
          ? money(prices.get(c.id)!.amount!)
          : "Not reported",
    },
    {
      label: "Buy-now price",
      visible: data.some((c) => prices.get(c.id)!.buyNowPrice != null),
      value: (c) =>
        prices.get(c.id)!.buyNowPrice != null
          ? money(prices.get(c.id)!.buyNowPrice!)
          : "Not reported",
    },
    {
      label: "Availability",
      value: (c) =>
        c.active === false
          ? "No longer active"
          : c.auctionEndAt && Date.parse(c.auctionEndAt) <= Date.now()
            ? "Auction ended"
            : !c.lastSeenAt || !Number.isFinite(Date.parse(c.lastSeenAt))
              ? "Availability unconfirmed"
              : Date.parse(c.lastSeenAt) < Date.now() - 7 * 86400000
                ? "Stale listing: recheck source"
                : "Recently seen: verify with seller",
    },
    {
      label: "Location",
      value: (c) =>
        [c.locationCity, c.locationState].filter(Boolean).join(", ") ||
        "Not reported",
    },
    { label: "VIN", value: (c) => c.vin || "Not reported" },
    {
      label: "Damage reported",
      visible: data.some(
        (c) => needsOperabilityFacts(c) || Boolean(c.damageType),
      ),
      value: (c) => c.damageType?.replace(/_/g, " ") || "Not reported",
    },
    {
      label: "Run and drive",
      visible: data.some(
        (c) => needsOperabilityFacts(c) || typeof c.runAndDrive === "boolean",
      ),
      value: (c) =>
        c.runAndDrive === true
          ? "Reported yes"
          : c.runAndDrive === false
            ? "Reported no"
            : "Not reported",
    },
    {
      label: "Keys",
      visible: data.some(
        (c) => needsOperabilityFacts(c) || typeof c.hasKeys === "boolean",
      ),
      value: (c) =>
        c.hasKeys === true
          ? "Reported yes"
          : c.hasKeys === false
            ? "Reported no"
            : "Not reported",
    },
    {
      label: "Mileage reported",
      value: (c) =>
        c.mileage == null ? "Not reported" : `${c.mileage.toLocaleString()} mi`,
    },
    {
      label: "Condition reported",
      value: (c) =>
        c.condition ? c.condition.replace(/_/g, " ") : "Not confirmed",
    },
    {
      label: "Repair allowance (estimate)",
      value: (c) => money(c.dealAnalysis?.costs?.repair),
    },
    {
      label: "Transport (estimate)",
      value: (c) => money(c.dealAnalysis?.costs?.transport),
    },
    {
      label: "Known-cost subtotal",
      value: (c) => {
        const price = prices.get(c.id)!;
        if (
          !price.comparisonEligible ||
          price.cashPrice == null ||
          c.active === false ||
          (c.auctionEndAt && Date.parse(c.auctionEndAt) <= Date.now())
        )
          return "Not confirmed";
        const extras = [
          c.dealAnalysis?.costs?.repair,
          c.dealAnalysis?.costs?.transport,
        ].filter(
          (value): value is number =>
            typeof value === "number" && Number.isFinite(value) && value >= 0,
        );
        return money(
          price.cashPrice + extras.reduce((sum, value) => sum + value, 0),
        );
      },
    },
    {
      label: "All-in cost",
      value: () =>
        "Incomplete: verify fees, tax, registration and repair quote",
    },
    {
      label: "Last seen at source",
      value: (c) =>
        c.lastSeenAt && Number.isFinite(new Date(c.lastSeenAt).getTime())
          ? new Date(c.lastSeenAt).toLocaleString()
          : "Unknown",
    },
    { label: "Listing source", value: (c) => sourceMeta(c.source || "").label },
    {
      label: "Next check",
      value: () => "Verify availability, title, inspection and final costs",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/saved"
          className="inline-flex min-h-11 items-center text-sm text-[var(--blue)]"
        >
          Back to Saved
        </Link>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={differencesOnly}
            onChange={(event) => setDifferencesOnly(event.target.checked)}
          />
          Differences only
        </label>
      </div>
      {!!result?.failed && (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 text-sm text-[var(--amber-d)]"
        >
          {result.failed} selected{" "}
          {result.failed === 1 ? "vehicle couldn't" : "vehicles couldn't"} load.
          Your saves are unchanged.
          <button
            type="button"
            onClick={() => void mutate()}
            className="inline-flex min-h-11 items-center gap-2 text-[var(--blue)]"
          >
            <RotateCcw size={16} />
            Retry
          </button>
        </div>
      )}
      <p id="comparison-cost-note" className="text-sm text-[var(--t3)]">
        Listing claims and estimated costs. A lower subtotal alone does not
        establish a better vehicle.
      </p>
      {overflows && (
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-end gap-2">
          <button
            type="button"
            aria-label="Previous vehicle"
            title="Previous vehicle"
            disabled={selectedIndex === 0}
            onClick={() => showColumn(selectedIndex - 1)}
            className="flex h-11 w-11 items-center justify-center rounded border border-[var(--b2)] text-[var(--t1)] disabled:opacity-40"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <label className="min-w-0 text-xs font-semibold text-[var(--t2)]">
            Comparison vehicle
            <div className="relative mt-1">
              <select
                value={data[selectedIndex].id}
                onChange={(event) =>
                  showColumn(
                    data.findIndex(
                      (candidate) => candidate.id === event.target.value,
                    ),
                  )
                }
                className="min-h-11 w-full min-w-0 rounded border border-[var(--b2)] bg-[var(--s0)] pl-2 pr-9 text-sm text-[var(--t1)]"
              >
                {data.map((candidate, index) => (
                  <option key={candidate.id} value={candidate.id}>
                    {index + 1} of {data.length}: {candidate.year}{" "}
                    {candidate.make} {candidate.model}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
              />
            </div>
          </label>
          <button
            type="button"
            aria-label="Next vehicle"
            title="Next vehicle"
            disabled={selectedIndex === data.length - 1}
            onClick={() => showColumn(selectedIndex + 1)}
            className="flex h-11 w-11 items-center justify-center rounded border border-[var(--b2)] text-[var(--t1)] disabled:opacity-40"
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </div>
      )}
      <div
        ref={comparisonRef}
        role="region"
        aria-label="Selected vehicle comparison"
        tabIndex={0}
        onScroll={(event) => {
          const region = event.currentTarget;
          const labelWidth = region
            .querySelector("thead th")!
            .getBoundingClientRect().width;
          const left = region.getBoundingClientRect().left + labelWidth;
          const columns = Array.from(
            region.querySelectorAll<HTMLTableCellElement>(
              'thead th[scope="col"]',
            ),
          );
          const nearest = columns.reduce(
            (best, column, index) =>
              Math.abs(column.getBoundingClientRect().left - left) <
              Math.abs(columns[best].getBoundingClientRect().left - left)
                ? index
                : best,
            0,
          );
          if (data[nearest]) setSelectedId(data[nearest].id);
        }}
        className="overflow-x-auto border border-[var(--b1)] rounded-lg"
      >
        <table className="w-full text-sm [overflow-wrap:anywhere]">
          <caption className="sr-only">
            Selected vehicles: prices, condition and costs
          </caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 min-w-24 w-24 bg-[var(--s0)] p-3 text-left">
                Compare
              </th>
              {data.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-[calc(100vw-160px)] w-[calc(100vw-160px)] sm:min-w-52 sm:w-64 p-3 text-left align-top"
                >
                  <div className="aspect-[4/3] w-full overflow-hidden rounded bg-[var(--s2)]">
                    {c.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={proxiedImage(c.images[0])}
                        alt={`${c.year || ""} ${c.make || ""} ${c.model || ""}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <span className="flex h-full items-center justify-center text-xs text-[var(--t3)]">
                        Photo unavailable
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/deal/${c.id}`}
                    prefetch={false}
                    className="inline-flex min-h-11 items-center text-[var(--blue)]"
                  >
                    {c.year} {c.make} {c.model}
                  </Link>
                  <p className="text-lg text-[var(--t1)]">
                    {prices.get(c.id)!.amount != null
                      ? money(prices.get(c.id)!.amount!)
                      : "Price not reported"}
                  </p>
                  <p className="text-xs font-normal text-[var(--t3)]">
                    {prices.get(c.id)!.label} ·{" "}
                    {sourceMeta(c.source || "").label}
                  </p>
                  {prices.get(c.id)!.advertisedAmount != null &&
                    prices.get(c.id)!.advertisedAmount !==
                      prices.get(c.id)!.amount && (
                      <p className="text-xs font-normal text-[var(--t3)]">
                        Advertised amount{" "}
                        {money(prices.get(c.id)!.advertisedAmount!)}
                      </p>
                    )}
                  {vendorIdentity(c.source, c.sourceUrl).href && (
                    <a
                      href={vendorIdentity(c.source, c.sourceUrl).href!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-h-11 items-center text-xs font-medium text-[var(--blue)]"
                    >
                      Original listing
                    </a>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((row) => row.visible !== false)
              .filter(
                (row) =>
                  !differencesOnly ||
                  [
                    "Price type",
                    "Reported amount",
                    "Buy-now price",
                    "Known-cost subtotal",
                    "Availability",
                    "All-in cost",
                    "Next check",
                  ].includes(row.label) ||
                  new Set(data.map(row.value)).size > 1,
              )
              .map((row) => (
                <tr key={row.label} className="border-t border-[var(--b1)]">
                  <th
                    scope="row"
                    className="sticky left-0 z-10 min-w-24 w-24 bg-[var(--s0)] p-3 text-left text-xs font-medium text-[var(--t3)]"
                  >
                    {row.label}
                  </th>
                  {data.map((c) => (
                    <td key={c.id} className="p-3 align-top">
                      {row.value(c)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
