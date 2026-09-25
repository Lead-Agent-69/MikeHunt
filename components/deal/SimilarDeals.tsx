"use client";

import React from "react";
import Link from "next/link";
import useSWR from "swr";
import { proxiedImage } from "@/lib/image-url";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

const VERDICT_COLOR: Record<string, string> = {
  go: "var(--green)",
  hold: "var(--amber)",
  pass: "var(--t4)",
};

/** Similar-deals rail for the deal detail page — semantic (pgvector) with attribute-based fallback. */
export function SimilarDeals({ dealId }: { dealId: string }) {
  const { data } = useSWR(`/api/deals/${dealId}/similar`, fetcher, {
    revalidateOnFocus: false,
  });
  const similar: any[] = data?.similar ?? [];
  if (similar.length === 0) return null;

  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 mb-2 px-1">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Similar deals
        </p>
        {data?.basis === "semantic" && (
          <span
            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: "var(--amber-lo)", color: "var(--amber-d)" }}
          >
            AI-matched
          </span>
        )}
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
              {d.similarity != null && (
                <span
                  className="absolute right-2 top-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                  style={{ background: "rgba(20,10,20,0.7)" }}
                >
                  {d.similarity}% match
                </span>
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-bold text-[var(--t1)] truncate">
                {[d.year, d.make, d.model].filter(Boolean).join(" ")}
              </p>
              <div className="flex items-center justify-between mt-1">
                <Mono
                  className="text-sm font-black text-[var(--t1)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {money(d.askPrice)}
                </Mono>
                {d.dealVerdict && (
                  <span
                    className="text-[10px] font-bold uppercase"
                    style={{
                      color: VERDICT_COLOR[d.dealVerdict] || "var(--t4)",
                    }}
                  >
                    {d.dealVerdict}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-[var(--t4)] mt-0.5 truncate">
                {[d.locationCity, d.locationState].filter(Boolean).join(", ")}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
