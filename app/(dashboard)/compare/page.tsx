"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v) || 0);

interface Spec {
  make: string;
  model: string;
  year: string;
}

const ROWS: {
  key: string;
  label: string;
  fmt: (v: any) => string;
  best?: "high" | "low";
}[] = [
  {
    key: "goDeals",
    label: "GO deals available",
    fmt: (v) => String(v ?? 0),
    best: "high",
  },
  { key: "avgProfit", label: "Avg profit / GO", fmt: money, best: "high" },
  {
    key: "totalListings",
    label: "Total listings",
    fmt: (v) => String(v ?? 0),
    best: "high",
  },
  {
    key: "avgDaysOnMarket",
    label: "Avg days on market",
    fmt: (v) => (v == null ? "—" : `${v}d`),
    best: "low",
  },
  {
    key: "depreciationPer1000Miles",
    label: "Depreciation / 1k mi",
    fmt: (v) => (v == null ? "—" : money(v)),
    best: "low",
  },
  {
    key: "pctChange30d",
    label: "Price trend (30d)",
    fmt: (v) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v}%`),
  },
];

export default function ComparePage() {
  const [specs, setSpecs] = useState<Spec[]>([
    { make: "", model: "", year: "" },
  ]);
  const [submitted, setSubmitted] = useState<string>("");

  const { data, isLoading } = useSWR(
    submitted ? `/api/market/compare?vehicles=${submitted}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const cols: any[] = data?.comparison ?? [];

  function update(i: number, k: keyof Spec, v: string) {
    setSpecs((s) => s.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  }
  function add() {
    if (specs.length < 4)
      setSpecs((s) => [...s, { make: "", model: "", year: "" }]);
  }
  function compare() {
    const valid = specs.filter((s) => s.make && s.model);
    if (!valid.length) return;
    setSubmitted(
      valid.map((s) => `${s.make}:${s.model}:${s.year || ""}`).join(","),
    );
  }

  const input =
    "bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-2.5 py-1.5 text-sm text-[var(--t1)] w-full";

  // Find the "best" value per row for highlighting.
  function isBest(rowKey: string, val: any, best?: "high" | "low") {
    if (!best || val == null || cols.length < 2) return false;
    const vals = cols.map((c) => c[rowKey]).filter((v) => v != null);
    if (!vals.length) return false;
    const target = best === "high" ? Math.max(...vals) : Math.min(...vals);
    return Number(val) === target;
  }

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
          Compare Vehicles
        </h1>
        <p className="text-[var(--t3)]">
          Which type is the better stock right now? Side-by-side profit, turn,
          and depreciation.
        </p>
      </div>

      <div className="glass-panel p-5 space-y-3">
        {specs.map((s, i) => (
          <div key={i} className="grid grid-cols-3 gap-2">
            <input
              className={input}
              placeholder="Make (Ford)"
              value={s.make}
              onChange={(e) => update(i, "make", e.target.value)}
            />
            <input
              className={input}
              placeholder="Model (F-150)"
              value={s.model}
              onChange={(e) => update(i, "model", e.target.value)}
            />
            <input
              className={input}
              placeholder="Year (opt)"
              value={s.year}
              onChange={(e) => update(i, "year", e.target.value)}
            />
          </div>
        ))}
        <div className="flex items-center justify-between">
          <button
            onClick={add}
            disabled={specs.length >= 4}
            className="text-sm font-semibold text-[var(--t3)] hover:text-[var(--amber)] disabled:opacity-40 flex items-center gap-1"
          >
            <Ico name="plus" size={14} /> Add vehicle
          </button>
          <button
            onClick={compare}
            className="px-5 py-2 rounded-[var(--r3)] font-bold text-sm text-white"
            style={{ background: "var(--amber)" }}
          >
            Compare
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-8 text-[var(--t3)]">Comparing…</div>
      )}

      {cols.length > 0 && (
        <div className="glass-panel p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--b1)]">
                <th className="text-left p-3 text-[var(--t4)] font-bold text-xs uppercase tracking-wider">
                  Metric
                </th>
                {cols.map((c, i) => (
                  <th
                    key={i}
                    className="text-right p-3 text-[var(--t1)] font-bold capitalize"
                  >
                    {c.make} {c.model}
                    {c.year ? ` '${String(c.year).slice(2)}` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr
                  key={row.key}
                  className="border-b border-[var(--b1)] last:border-0"
                >
                  <td className="p-3 text-[var(--t3)] font-semibold">
                    {row.label}
                  </td>
                  {cols.map((c, i) => {
                    const best = isBest(row.key, c[row.key], row.best);
                    return (
                      <td key={i} className="p-3 text-right">
                        <Mono
                          className="font-bold"
                          style={{
                            fontFamily: "var(--fm)",
                            color: best ? "var(--green)" : "var(--t1)",
                          }}
                        >
                          {row.fmt(c[row.key])}
                        </Mono>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
