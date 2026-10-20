"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Mono } from "@/components/shared/Mono";
import { ExternalLink, Landmark, RefreshCw } from "lucide-react";

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
  const govLane = Array.isArray(data?.govLane) ? data.govLane : [];
  const govCredits = Array.from(
    new Set(
      govLane
        .map((row: any) => String(row.attribution || "").trim())
        .filter(Boolean),
    ),
  );
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

        {govLane.length > 0 && !error ? (
          <section className="mt-5 border-t border-[var(--b1)] pt-5">
            <div className="mb-3 flex items-start gap-3">
              <Landmark
                size={18}
                className="mt-0.5 shrink-0 text-[var(--blue)]"
                aria-hidden="true"
              />
              <div>
                <h3 className="text-sm font-bold text-[var(--t1)]">
                  Government auction results
                </h3>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--t4)]">
                  Separate market lane. Impound and fleet prices are not used as
                  clean retail comps.
                </p>
              </div>
            </div>
            <div className="divide-y divide-[var(--b1)]">
              {govLane.map((sale: any, index: number) => {
                const content = (
                  <>
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[var(--t2)]">
                        {sale.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--t4)]">
                        {sale.basis === "last_bid"
                          ? "Last observed bid at close"
                          : "Reported sold price"}
                        {soldOn(sale.soldAt) ? ` · ${soldOn(sale.soldAt)}` : ""}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <Mono className="font-bold text-[var(--t1)]">
                        {money(sale.price)}
                      </Mono>
                      {sale.sourceUrl ? (
                        <ExternalLink
                          size={14}
                          className="text-[var(--t4)]"
                          aria-hidden="true"
                        />
                      ) : null}
                    </span>
                  </>
                );
                return sale.sourceUrl ? (
                  <a
                    key={`${sale.source || "gov"}-${sale.soldAt || index}`}
                    href={sale.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-14 items-center justify-between gap-3 py-2"
                  >
                    {content}
                  </a>
                ) : (
                  <div
                    key={`${sale.source || "gov"}-${sale.soldAt || index}`}
                    className="flex min-h-14 items-center justify-between gap-3 py-2"
                  >
                    {content}
                  </div>
                );
              })}
            </div>
            {govCredits.length > 0 ? (
              <p className="mt-3 text-[11px] leading-relaxed text-[var(--t5)]">
                Sources: {govCredits.join(" ")}
              </p>
            ) : null}
          </section>
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
