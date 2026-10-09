"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { proxiedImage } from "@/lib/image-url";
import { Mono } from "@/components/shared/Mono";
import { buyTerm } from "@/lib/deal-terms";
import { sourceMeta } from "@/lib/sources/source-meta";
import { ErrorState } from "@/components/shared/ErrorState";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Alternatives couldn't be loaded.");
  return response.json();
};
const money = (v: any) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

/** Current alternatives ranked by buying-channel, model and price fit. */
export function SimilarDeals({ dealId }: { dealId: string }) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/deals/${dealId}/similar`,
    fetcher,
    {
      revalidateOnFocus: false,
    },
  );
  const similar: any[] = data?.similar ?? [];
  if (isLoading)
    return (
      <p role="status" className="text-sm text-[var(--t3)]">
        Finding current alternatives...
      </p>
    );
  if (error)
    return (
      <ErrorState
        title="Alternatives unavailable"
        message="We couldn't check current listings. Try again shortly."
        onRetry={() => void mutate()}
      />
    );
  if (similar.length === 0)
    return (
      <p className="text-sm text-[var(--t3)]">
        No recently seen alternatives match this model and buying channel right
        now.
      </p>
    );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Current alternatives
        </p>
      </div>
      <div
        className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6"
        style={{ scrollSnapType: "x mandatory" }}
      >
        {similar.map((d) => (
          <Link
            key={d.id}
            href={`/deal/${d.id}`}
            className="glass-panel group flex flex-col overflow-hidden shrink-0"
            style={{ width: 200, padding: 0, scrollSnapAlign: "start" }}
          >
            <div
              className="relative w-full aspect-[4/3] overflow-hidden"
              style={{ background: "var(--s2)" }}
            >
              {d.images?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proxiedImage(d.images[0])}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : null}
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-[var(--t1)] break-words">
                {[d.year, d.make, d.model].filter(Boolean).join(" ")}
              </p>
              <div className="flex items-center justify-between mt-1">
                <Mono
                  className="text-sm font-black text-[var(--t1)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {money(d.askPrice)}
                </Mono>
              </div>
              <p className="text-[11px] text-[var(--t3)]">
                {buyTerm(d.source).priceLabel} ·{" "}
                {sourceMeta(d.source || "").label}
              </p>
              <p className="text-[11px] text-[var(--t4)] mt-0.5 truncate">
                {[d.locationCity, d.locationState].filter(Boolean).join(", ")}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-[var(--t2)]">
                {(d.matchReasons || []).slice(0, 4).map((reason: string) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-[var(--t3)]">
                {d.condition
                  ? `${d.condition.replace(/_/g, " ")} reported`
                  : "Condition unconfirmed"}
              </p>
              {d.damageType && d.damageType !== "none" && (
                <p className="text-[11px] text-[var(--t3)]">
                  Damage reported: {d.damageType.replace(/_/g, " ")}
                </p>
              )}
              <p className="mt-1 text-[11px] text-[var(--t3)]">
                {d.lastSeenAt && Number.isFinite(Date.parse(d.lastSeenAt))
                  ? `Seen ${new Date(d.lastSeenAt).toLocaleDateString()}`
                  : "Last seen unknown"}{" "}
                · Verify availability
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
