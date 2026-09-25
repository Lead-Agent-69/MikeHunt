"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/shared/Mono";
import { dealLane, LANE_COLORS } from "@/lib/discovery/categorize";
import { buyTerms } from "@/lib/sources/source-meta";
import { SourceBadge } from "@/components/shared/SourceBadge";

// Dense, sortable table view — the fastest way to scan many lots (Visor "table view", done better:
// sticky header, GPU-only hover transitions, and content-visibility so 500+ rows stay 60fps).

export interface TableRow {
  id: string;
  source: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  askPrice: number;
  mileage?: number;
  sellEstimate?: number;
  profitEstimate: number;
  profitScore: number;
  dealVerdict?: "go" | "hold" | "pass";
  recommendedMaxBid?: number;
  locationState?: string;
  condition?: string;
  damageType?: string;
}

type SortKey =
  | "vehicle"
  | "askPrice"
  | "mileage"
  | "sellEstimate"
  | "profitEstimate"
  | "recommendedMaxBid"
  | "profitScore";

const fmt = (v?: number | null) =>
  v == null ? "—" : `$${Math.round(v).toLocaleString()}`;
const fmtMi = (v?: number | null) =>
  v == null || v <= 0 ? "—" : `${Math.round(v).toLocaleString()}`;

const VERDICT_COLOR: Record<string, string> = {
  go: "var(--green)",
  hold: "var(--amber)",
  pass: "var(--red)",
};

const LANE_LABEL: Record<string, string> = {
  auction: "Auction",
  salvage: "Salvage",
  repairable: "Repair",
  "clean-retail": "Retail",
  private: "Private",
};

export function DealTable({ rows }: { rows: TableRow[] }) {
  const router = useRouter();
  const [sortKey, setSortKey] = React.useState<SortKey>("profitEstimate");
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");

  const sorted = React.useMemo(() => {
    const val = (r: TableRow): number | string => {
      switch (sortKey) {
        case "vehicle":
          return `${r.make} ${r.model}`.toLowerCase();
        case "askPrice":
          return r.askPrice || 0;
        case "mileage":
          return r.mileage || 0;
        case "sellEstimate":
          return r.sellEstimate || 0;
        case "recommendedMaxBid":
          return r.recommendedMaxBid || 0;
        case "profitScore":
          return r.profitScore || 0;
        default:
          return r.profitEstimate || 0;
      }
    };
    const out = [...rows].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string")
        return String(va).localeCompare(String(vb));
      return va - vb;
    });
    return dir === "desc" ? out.reverse() : out;
  }, [rows, sortKey, dir]);

  const toggle = (k: SortKey) => {
    if (k === sortKey) setDir((d) => (d === "desc" ? "asc" : "desc"));
    else {
      setSortKey(k);
      setDir(k === "vehicle" ? "asc" : "desc");
    }
  };

  const Th = ({
    k,
    label,
    align = "right",
  }: {
    k: SortKey;
    label: string;
    align?: "left" | "right";
  }) => (
    <th
      onClick={() => toggle(k)}
      className={`sticky top-0 z-10 cursor-pointer select-none px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-colors hover:text-[var(--t1)] ${
        align === "left" ? "text-left" : "text-right"
      }`}
      style={{
        background: "var(--s1)",
        color: sortKey === k ? "var(--t1)" : "var(--t4)",
      }}
    >
      {label}
      {sortKey === k && (
        <span className="ml-1">{dir === "desc" ? "↓" : "↑"}</span>
      )}
    </th>
  );

  return (
    <div
      className="overflow-x-auto rounded-[var(--r2)] border border-[var(--b1)]"
      style={{ background: "var(--s0)" }}
    >
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <Th k="vehicle" label="Vehicle" align="left" />
            <th
              className="sticky top-0 z-10 px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--s1)", color: "var(--t4)" }}
            >
              Lane
            </th>
            <Th k="askPrice" label="Price" />
            <Th k="mileage" label="Miles" />
            <Th k="sellEstimate" label="Sell est." />
            <Th k="recommendedMaxBid" label="Max buy" />
            <Th k="profitEstimate" label="Net profit" />
            <th
              className="sticky top-0 z-10 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--s1)", color: "var(--t4)" }}
            >
              Call
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const lane = dealLane(r);
            const vc = VERDICT_COLOR[r.dealVerdict || "pass"] || "var(--t4)";
            const profitPos = (r.profitEstimate || 0) > 0;
            return (
              <tr
                key={r.id}
                onClick={() => router.push(`/deal/${r.id}`)}
                className="cursor-pointer border-t border-[var(--b1)] transition-colors hover:bg-[var(--s1)]"
                style={{
                  contentVisibility: "auto",
                  containIntrinsicSize: "44px",
                }}
              >
                <td className="px-3 py-2.5 max-w-[280px]">
                  <div className="flex items-center gap-1.5 truncate font-semibold text-[var(--t1)]">
                    {(r as any).deal_analysis?.vinFlagSeverity === "high" && (
                      <span
                        className="shrink-0"
                        style={{ color: "var(--red)" }}
                        title={((r as any).deal_analysis?.vinFlags || []).join(
                          " · ",
                        )}
                      >
                        ⚠
                      </span>
                    )}
                    <span className="truncate">
                      {r.year} {r.make} {r.model}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <SourceBadge source={r.source} size="sm" />
                    <span className="truncate text-[11px] text-[var(--t4)]">
                      {[
                        r.trim,
                        r.condition ? r.condition.replace(/_/g, " ") : null,
                        r.locationState,
                        (() => {
                          const fs = (r as any).firstSeenAt;
                          if (!fs) return null;
                          const d = Math.floor(
                            (Date.now() - new Date(fs).getTime()) / 86_400_000,
                          );
                          return d >= 0 ? `${d}d` : null;
                        })(),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{
                      background: `${LANE_COLORS[lane]}1f`, // ~12% tint
                      color: LANE_COLORS[lane],
                    }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ background: LANE_COLORS[lane] }}
                    />
                    {LANE_LABEL[lane] || lane}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Mono className="font-bold text-[var(--t1)]">
                    {fmt(r.askPrice)}
                  </Mono>
                  <div className="text-[9px] uppercase text-[var(--t5)]">
                    {buyTerms(r.source).priceLabel}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Mono className="text-[var(--t2)]">{fmtMi(r.mileage)}</Mono>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Mono className="text-[var(--t2)]">
                    {fmt(r.sellEstimate)}
                  </Mono>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Mono className="text-[var(--t2)]">
                    {fmt(r.recommendedMaxBid)}
                  </Mono>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <Mono
                    className="font-black"
                    style={{ color: profitPos ? "var(--green)" : "var(--red)" }}
                  >
                    {profitPos ? "+" : ""}
                    {fmt(r.profitEstimate)}
                  </Mono>
                </td>
                <td className="px-3 py-2.5 text-center">
                  <span
                    className="inline-block rounded-md px-2 py-1 text-[10px] font-black uppercase text-white"
                    style={{ background: vc }}
                  >
                    {(r.dealVerdict || "—").toUpperCase()}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
