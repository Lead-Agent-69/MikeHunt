"use client";

import React, { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(v) || 0);

export default function BulkPage() {
  const [minCount, setMinCount] = useState("2");
  const [maxPrice, setMaxPrice] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const params = new URLSearchParams({ minCount });
  if (maxPrice) params.set("maxPrice", maxPrice);
  const { data, error, isLoading } = useSWR(
    `/api/bulk?${params.toString()}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const groups: any[] = data?.groups ?? [];
  const loadFailed = !!error || (data && data.error);

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          Bulk Sourcing
        </h1>
        <p className="text-[var(--t3)]">
          Same make &amp; model available in volume across sources — buy a
          fleet, not a car.
        </p>
      </div>

      <div className="glass-panel px-4 py-3 flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--t4)] font-semibold uppercase tracking-wider flex items-center gap-1.5">
          <Ico name="filter" size={13} /> Filters
        </span>
        <label className="text-sm text-[var(--t2)] flex items-center gap-2">
          Min units
          <select
            value={minCount}
            onChange={(e) => setMinCount(e.target.value)}
            className="bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-2 py-1 text-sm"
          >
            {["2", "3", "5", "10"].map((n) => (
              <option key={n} value={n}>
                {n}+
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-[var(--t2)] flex items-center gap-2">
          Max price
          <select
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            className="bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-2 py-1 text-sm"
          >
            <option value="">Any</option>
            <option value="10000">Under $10k</option>
            <option value="20000">Under $20k</option>
            <option value="35000">Under $35k</option>
          </select>
        </label>
        {!isLoading && (
          <span className="text-xs text-[var(--t3)] ml-auto font-mono">
            {groups.length} groups
          </span>
        )}
      </div>

      {loadFailed ? (
        <div className="glass-panel p-10 text-center">
          <Ico
            name="alert-triangle"
            size={24}
            className="mx-auto text-[var(--red)] mb-2"
          />
          <p className="text-sm font-bold text-[var(--t1)]">
            Couldn&apos;t load bulk opportunities
          </p>
          <p className="text-xs text-[var(--t4)] mt-1">
            Try again in a moment.
          </p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-12 text-[var(--t3)]">
          Finding volume opportunities…
        </div>
      ) : groups.length === 0 ? (
        <div className="glass-panel p-10 text-center text-[var(--t4)]">
          No multi-unit groups match. Lower the min-unit count or widen price.
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const isOpen = expanded === g.key;
            return (
              <div key={g.key} className="glass-panel overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : g.key)}
                  className="w-full flex items-center gap-4 p-4 text-left"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-[var(--r2)] text-white font-black shrink-0"
                    style={{ background: "var(--grad)" }}
                  >
                    {g.count}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-[var(--t1)] capitalize">
                      {g.make} {g.model}
                    </h3>
                    <div className="text-xs text-[var(--t4)] flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      <span>
                        {money(g.minPrice)}–{money(g.maxPrice)}
                      </span>
                      <span>{g.goCount} GO</span>
                      <span>
                        {g.sources.length} source
                        {g.sources.length !== 1 ? "s" : ""}
                      </span>
                      <span>
                        {g.states.slice(0, 4).join(", ")}
                        {g.states.length > 4 ? "…" : ""}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Mono
                      className="text-base font-black text-[var(--green)]"
                      style={{ fontFamily: "var(--fm)" }}
                    >
                      {money(g.totalProfit)}
                    </Mono>
                    <p className="text-[10px] text-[var(--t4)] font-semibold">
                      est. total profit
                    </p>
                  </div>
                  <Ico
                    name={isOpen ? "close" : "arrow"}
                    size={16}
                    className="text-[var(--t4)] shrink-0"
                  />
                </button>
                {isOpen && (
                  <div className="border-t border-[var(--b1)] divide-y divide-[var(--b1)]">
                    {g.deals.map((d: any) => (
                      <Link
                        key={d.id}
                        href={`/deal/${d.id}`}
                        className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-[var(--s1)] transition-colors"
                      >
                        <div className="text-sm text-[var(--t2)]">
                          {d.year} {g.make} {g.model}
                          <span className="text-[var(--t4)]">
                            {" "}
                            · {[d.city, d.state]
                              .filter(Boolean)
                              .join(", ")} · {d.source}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {d.verdict && (
                            <span
                              className="text-[10px] font-bold uppercase"
                              style={{
                                color:
                                  d.verdict === "go"
                                    ? "var(--green)"
                                    : d.verdict === "hold"
                                      ? "var(--amber)"
                                      : "var(--t4)",
                              }}
                            >
                              {d.verdict}
                            </span>
                          )}
                          <Mono
                            className="text-sm font-bold text-[var(--t1)]"
                            style={{ fontFamily: "var(--fm)" }}
                          >
                            {money(d.askPrice)}
                          </Mono>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
