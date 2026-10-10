"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Mono } from "@/components/shared/Mono";
import { RefreshCw } from "lucide-react";

// Distinguish source-reported sale records from verified transaction/title evidence.
const fetcher = async (u: string) => {
  const response = await fetch(u);
  if (!response.ok) throw new Error("Sale records unavailable");
  return response.json();
};
const money = (n?: number | null) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString()}`;
const soldOn = (iso?: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

export function RecentlySold({
  make,
  model,
  year,
}: {
  make?: string | null;
  model?: string | null;
  year?: number | null;
}) {
  const key =
    make && model
      ? `/api/sold?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}${year ? `&year=${year}` : ""}`
      : null;
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
  });
  const cleanCount = Number(data?.count || 0);
  const showPrice = data?.median != null && cleanCount >= 3;
  if (!key) return null;

  return (
    <Card
      className="border-none"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Recent sale records · {make} {model}
          </p>
          <span className="text-[10px] text-[var(--t5)]">source-reported</span>
        </div>

        {error ? (
          <div
            className="flex flex-wrap items-center gap-3 text-sm text-[var(--t3)]"
            role="status"
          >
            <span>
              Sale records could not be checked. No resale price is confirmed.
            </span>
            <button
              type="button"
              onClick={() => void mutate()}
              className="inline-flex min-h-11 items-center gap-2 text-[var(--blue)]"
            >
              <RefreshCw size={16} aria-hidden="true" />
              Retry
            </button>
          </div>
        ) : isLoading ? (
          <p className="text-sm text-[var(--t3)]" role="status">
            Checking recent sale records…
          </p>
        ) : showPrice ? (
          <div className="flex items-end gap-5 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold">
                Clean-title reported median
              </p>
              <Mono className="text-3xl font-black text-[var(--t1)] leading-none">
                {money(data.median)}
              </Mono>
            </div>
            <p className="text-xs text-[var(--t3)] font-semibold pb-1">
              {cleanCount} clean sales
              {soldOn(data.soldAt) ? ` · newest ${soldOn(data.soldAt)}` : ""}
              {` · ${money(data.low)}–${money(data.high)}`}
            </p>
          </div>
        ) : (
          <p className="mb-4 text-sm leading-relaxed text-[var(--t3)]">
            {data?.note ||
              "No qualifying recent sales on file. Resale value is not confirmed."}
          </p>
        )}

        {showPrice && !error ? (
          <div className="divide-y divide-[var(--b1)]">
            {(data.sales || []).map((s: any, i: number) => (
              <a
                key={i}
                href={s.sourceUrl || undefined}
                target={s.sourceUrl ? "_blank" : undefined}
                rel={s.sourceUrl ? "noopener noreferrer" : undefined}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="truncate text-[var(--t2)]">
                  {s.lane === "salvage"
                    ? "Salvage reported · "
                    : s.lane === "unknown"
                      ? "Title unreported · "
                      : "Clean title reported · "}
                  {s.title}
                  {soldOn(s.soldAt) ? ` · ${soldOn(s.soldAt)}` : ""}
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  {s.mileage ? (
                    <Mono className="text-xs text-[var(--t4)]">
                      {Math.round(s.mileage).toLocaleString()} mi
                    </Mono>
                  ) : null}
                  <Mono className="font-bold text-[var(--green)]">
                    {money(s.price)}
                  </Mono>
                </div>
              </a>
            ))}
          </div>
        ) : null}
        {!error && data?.govLane?.sales?.length ? (
          <GovLane lane={data.govLane} />
        ) : null}
        {data && !error && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--t4)]">
            Last {data.windowDays} days ·{" "}
            {data.evidenceLabel ||
              "Source-reported records, not independently verified title or condition."}
            {soldOn(data.checkedAt)
              ? ` · Checked ${soldOn(data.checkedAt)}`
              : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// Government impound / fleet / surplus auction results and GSA closing bids. Shown apart from the
// retail median (never part of it), each with its price meaning, and with the source credits the
// data licences require (CC BY 4.0 for the GSA dataset) printed under the list.
export function GovLane({
  lane,
}: {
  lane: {
    note?: string;
    sales?: Array<{
      title?: string | null;
      year?: number | null;
      price?: number | null;
      priceLabel?: string;
      soldAt?: string | null;
      sourceUrl?: string | null;
      attribution?: string | null;
    }>;
    credits?: string[];
  };
}) {
  const sales = (lane.sales || []).filter((s) => s.attribution);
  if (!sales.length) return null;
  const credits = Array.from(
    new Set([
      ...(lane.credits || []),
      ...sales.map((s) => String(s.attribution)),
    ]),
  );
  return (
    <section className="mt-5" aria-label="Government auction results">
      <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
        Government auction results · not retail prices
      </p>
      <div className="mt-2 divide-y divide-[var(--b1)]">
        {sales.slice(0, 6).map((s, i) => (
          <a
            key={i}
            href={s.sourceUrl || undefined}
            target={s.sourceUrl ? "_blank" : undefined}
            rel={s.sourceUrl ? "noopener noreferrer" : undefined}
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="truncate text-[var(--t2)]">
              {s.title || s.year || "Vehicle"}
              {soldOn(s.soldAt) ? ` · ${soldOn(s.soldAt)}` : ""}
            </span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-[var(--t4)]">
                {s.priceLabel || "Sold for"}
              </span>
              <Mono className="font-bold text-[var(--t2)]">
                {money(s.price)}
              </Mono>
            </span>
          </a>
        ))}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
        {lane.note ||
          "Government auction results. Not retail prices; not part of the median above."}{" "}
        Sources: {credits.join(" · ")}
      </p>
    </section>
  );
}
