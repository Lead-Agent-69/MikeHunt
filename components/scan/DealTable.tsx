"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Mono } from "@/components/shared/Mono";
import { dealLane, LANE_COLORS } from "@/lib/discovery/categorize";
import { dealerSourceIdFromUrl } from "@/lib/sources/source-meta";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";
import { SourceBadge } from "@/components/shared/SourceBadge";
import { gradeDataQuality, qualityFieldLabel } from "@/lib/data-quality";

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
  titleType?: string;
  vin?: string;
  imageUrl?: string;
  sourceUrl?: string;
  seller?: string;
  sellerType?: string;
  sellerPhone?: string;
  sellerEmail?: string;
  sellerContactUrl?: string;
  auctionEndAt?: string | Date;
  firstSeenAt?: string | Date;
  lastSeenAt?: string | Date;
  warnings?: string[];
  dataQuality?: {
    score: number;
    label: "Excellent" | "Good" | "Thin" | "Sparse";
    missing: string[];
  };
}

export interface TableSourceHealth {
  readiness?: string;
  userStatus?: string;
  activeRows?: number;
  rowsWithPhotos?: number;
  photoCoveragePct?: number;
  freshnessHours?: number | null;
}

type SortKey =
  | "vehicle"
  | "askPrice"
  | "mileage"
  | "sellEstimate"
  | "profitEstimate"
  | "recommendedMaxBid"
  | "dataQuality"
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

export const TABLE_PROOF_FIELD_COUNT = 11;

function relativeFreshness(value?: string | Date | null) {
  if (!value) return "unknown";
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms)) return "unknown";
  const hours = Math.max(0, Math.round(ms / 3_600_000));
  if (hours < 1) return "now";
  if (hours < 24) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function proofCount(r: TableRow) {
  const total =
    String(r.sellerType || "").toLowerCase() === "dealer" ||
    String(r.sellerType || "").toLowerCase() === "private" ||
    String(r.sellerType || "").toLowerCase() === "retail"
      ? TABLE_PROOF_FIELD_COUNT - 1
      : TABLE_PROOF_FIELD_COUNT;
  if (r.dataQuality?.missing) {
    return Math.max(0, total - r.dataQuality.missing.length);
  }
  return gradeDataQuality({
    images: [],
    imageUrl: r.imageUrl,
    vin: r.vin,
    titleType: r.titleType,
    condition: r.condition,
    damageType: r.damageType,
    mileage: r.mileage,
    locationState: r.locationState,
    askPrice: r.askPrice,
    seller: r.seller,
    sellerType: r.sellerType,
    sellerPhone: r.sellerPhone,
    sellerEmail: r.sellerEmail,
    sellerContactUrl: r.sellerContactUrl,
    auctionEndAt: r.auctionEndAt,
    sourceUrl: r.sourceUrl,
  }).present.length;
}

export function proofFieldCount(r: TableRow) {
  return String(r.sellerType || "").toLowerCase() === "dealer" ||
    String(r.sellerType || "").toLowerCase() === "private" ||
    String(r.sellerType || "").toLowerCase() === "retail"
    ? TABLE_PROOF_FIELD_COUNT - 1
    : TABLE_PROOF_FIELD_COUNT;
}

function sourceHealthForRow(
  row: TableRow,
  sourceHealthById?: Map<string, TableSourceHealth>,
) {
  if (!sourceHealthById) return undefined;
  const source = String(row.source || "");
  const url = String(row.sourceUrl || "").toLowerCase();
  if (sourceHealthById.has(source)) return sourceHealthById.get(source);
  if (source === "gov_auction") {
    if (url.includes("govdeals.com")) return sourceHealthById.get("govdeals");
    if (url.includes("publicsurplus"))
      return sourceHealthById.get("publicsurplus");
    if (url.includes("municibid")) return sourceHealthById.get("municibid");
    if (url.includes("gsa")) return sourceHealthById.get("gsa_auctions");
  }
  if (source === "independent_dealer") {
    const dealerSourceId = dealerSourceIdFromUrl(
      url,
      Array.from(sourceHealthById.keys()),
    );
    if (dealerSourceId) return sourceHealthById.get(dealerSourceId);
    return sourceHealthById.get("curated_dealers");
  }
  return undefined;
}

/** Columns that expose flip economics; reseller/dealer desks only. */
const FLIP_ONLY_SORT_KEYS: ReadonlySet<SortKey> = new Set<SortKey>([
  "recommendedMaxBid",
  "profitEstimate",
]);

export function DealTable({
  rows,
  sourceHealthById,
  flipDesk = false,
}: {
  rows: TableRow[];
  sourceHealthById?: Map<string, TableSourceHealth>;
  /** Reseller/dealer desk (isFlipBuyerMode). Unknown = personal. */
  flipDesk?: boolean;
}) {
  const router = useRouter();
  // Non-flip desks keep the Scan order (score-first) instead of net profit.
  const [chosenSortKey, setSortKey] = React.useState<SortKey | null>(
    flipDesk ? "profitEstimate" : null,
  );
  const [dir, setDir] = React.useState<"asc" | "desc">("desc");
  // Same desk wording as DealCard: auction "Current bid" reads "Current price" off the flip desk.
  const priceCopy = dealCardCopy(flipDesk);
  const sortKey =
    chosenSortKey && !flipDesk && FLIP_ONLY_SORT_KEYS.has(chosenSortKey)
      ? null
      : chosenSortKey;

  const sorted = React.useMemo(() => {
    if (!sortKey) return rows;
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
        case "dataQuality":
          return (
            r.dataQuality?.score ||
            Math.round((proofCount(r) / proofFieldCount(r)) * 100)
          );
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
            <Th
              k="sellEstimate"
              label={flipDesk ? "Sell est." : "Market est."}
            />
            {flipDesk && <Th k="recommendedMaxBid" label="Max buy" />}
            {flipDesk && <Th k="profitEstimate" label="Net profit" />}
            <Th k="dataQuality" label="Proof" />
            <th
              className="sticky top-0 z-10 px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider"
              style={{ background: "var(--s1)", color: "var(--t4)" }}
            >
              Verdict
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const lane = dealLane(r);
            const vc = VERDICT_COLOR[r.dealVerdict || "pass"] || "var(--t4)";
            const profitPos = (r.profitEstimate || 0) > 0;
            const proof = proofCount(r);
            const qualityScore =
              r.dataQuality?.score ||
              Math.round((proof / proofFieldCount(r)) * 100);
            const fresh = relativeFreshness(r.lastSeenAt || r.firstSeenAt);
            const missing = r.dataQuality?.missing || [];
            const warning = r.warnings?.find(Boolean);
            const sourceHealth = sourceHealthForRow(r, sourceHealthById);
            const sourceReadiness = sourceHealth?.readiness || "unknown";
            const sourceTone =
              sourceReadiness === "ready"
                ? "var(--green)"
                : sourceReadiness === "blocked" ||
                    sourceReadiness === "needs_login"
                  ? "var(--red)"
                  : sourceReadiness === "unknown"
                    ? "var(--t5)"
                    : "var(--amber-d)";
            const sourceFreshness =
              typeof sourceHealth?.freshnessHours === "number"
                ? sourceHealth.freshnessHours < 1
                  ? "now"
                  : sourceHealth.freshnessHours < 24
                    ? `${sourceHealth.freshnessHours}h`
                    : `${Math.round(sourceHealth.freshnessHours / 24)}d`
                : "pending";
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
                    <SourceBadge
                      source={r.source}
                      sourceUrl={r.sourceUrl}
                      size="sm"
                    />
                    <span
                      className="rounded-full border border-[var(--b1)] bg-[var(--s1)] px-1.5 py-0.5 text-[9px] font-black uppercase"
                      style={{ color: sourceTone }}
                      title={
                        sourceHealth
                          ? `${sourceHealth.userStatus || sourceReadiness} · ${Number(
                              sourceHealth.activeRows || 0,
                            ).toLocaleString()} scoped rows · ${Number(
                              sourceHealth.photoCoveragePct || 0,
                            )}% photo coverage · ${sourceFreshness}`
                          : "No scoped source health returned yet"
                      }
                    >
                      {sourceHealth?.userStatus || sourceReadiness}
                    </span>
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
                    {priceCopy.priceLabel(r.source)}
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
                {flipDesk && (
                  <td className="px-3 py-2.5 text-right">
                    <Mono className="text-[var(--t2)]">
                      {fmt(r.recommendedMaxBid)}
                    </Mono>
                  </td>
                )}
                {flipDesk && (
                  <td className="px-3 py-2.5 text-right">
                    <Mono
                      className="font-black"
                      style={{
                        color: profitPos ? "var(--green)" : "var(--red)",
                      }}
                    >
                      {profitPos ? "+" : ""}
                      {fmt(r.profitEstimate)}
                    </Mono>
                  </td>
                )}
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{
                        background:
                          qualityScore >= 68 ? "var(--glo)" : "var(--amber-lo)",
                        color:
                          qualityScore >= 68
                            ? "var(--green)"
                            : "var(--amber-d)",
                      }}
                      title={
                        missing.length
                          ? `Missing ${missing
                              .slice(0, 4)
                              .map(qualityFieldLabel)
                              .join(", ")}`
                          : "Core listing fields are present"
                      }
                    >
                      {qualityScore}
                    </span>
                    <span
                      className="rounded-full border border-[var(--b1)] bg-[var(--s1)] px-2 py-0.5 text-[10px] font-black text-[var(--t3)]"
                      title={`${proof}/${proofFieldCount(r)} relevant fields present`}
                    >
                      {proof}/{proofFieldCount(r)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-end gap-1 text-[9px] uppercase text-[var(--t5)]">
                    <span>{fresh}</span>
                    <span>·</span>
                    <span>{r.sourceUrl ? "link" : "no link"}</span>
                    <span>·</span>
                    <span>
                      {r.sellerPhone || r.sellerEmail || r.sellerContactUrl
                        ? "contact"
                        : "no contact"}
                    </span>
                    <span>·</span>
                    <span>{r.imageUrl ? "photo" : "no photo"}</span>
                  </div>
                  {warning && (
                    <div
                      className="mt-1 max-w-[180px] truncate text-right text-[9px] font-bold text-[var(--amber-d)]"
                      title={warning}
                    >
                      Warning: {warning}
                    </div>
                  )}
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
