"use client";

import Link from "next/link";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/ErrorState";
import { sourceMeta } from "@/lib/sources/source-meta";
import { buyTerm } from "@/lib/deal-terms";

type Candidate = {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number;
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
  value == null || !Number.isFinite(value)
    ? "Not confirmed"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);

export function VehicleComparison({ ids }: { ids: string[] }) {
  const [differencesOnly, setDifferencesOnly] = useState(false);
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

  const rows: { label: string; value: (candidate: Candidate) => string }[] = [
    { label: "Price type", value: (c) => buyTerm(c.source).priceLabel },
    {
      label: "Listed price / bid",
      value: (c) =>
        c.askPrice != null && c.askPrice > 0
          ? money(c.askPrice)
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
      value: (c) => c.damageType?.replace(/_/g, " ") || "Not reported",
    },
    {
      label: "Run and drive",
      value: (c) =>
        c.runAndDrive === true
          ? "Reported yes"
          : c.runAndDrive === false
            ? "Reported no"
            : "Not reported",
    },
    {
      label: "Keys",
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
      value: (c) =>
        c.askPrice == null || c.askPrice <= 0
          ? "Not confirmed"
          : money(
              c.askPrice +
                (c.dealAnalysis?.costs?.repair || 0) +
                (c.dealAnalysis?.costs?.transport || 0),
            ),
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
      <div
        role="region"
        aria-label="Selected vehicle comparison"
        tabIndex={0}
        className="overflow-x-auto border border-[var(--b1)] rounded-lg"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">
            Selected vehicles: prices, condition and costs
          </caption>
          <thead>
            <tr>
              <th className="min-w-36 p-3 text-left">Compare</th>
              {data.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="min-w-52 w-64 p-3 text-left align-top"
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
                    className="inline-flex min-h-11 items-center text-[var(--blue)]"
                  >
                    {c.year} {c.make} {c.model}
                  </Link>
                  <p className="text-lg text-[var(--t1)]">
                    {c.askPrice != null && c.askPrice > 0
                      ? money(c.askPrice)
                      : "Price not reported"}
                  </p>
                  <p className="text-xs font-normal text-[var(--t3)]">
                    {buyTerm(c.source).priceLabel} ·{" "}
                    {sourceMeta(c.source || "").label}
                  </p>
                  {c.sourceUrl && (
                    <a
                      href={c.sourceUrl}
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
              .filter(
                (row) =>
                  !differencesOnly ||
                  [
                    "Price type",
                    "Listed price / bid",
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
                    className="p-3 text-left font-medium text-[var(--t3)]"
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
