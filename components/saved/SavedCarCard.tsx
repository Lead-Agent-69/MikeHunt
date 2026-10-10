// components/saved/SavedCarCard.tsx
"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FindSimilarModal } from "./FindSimilarModal";
import {
  Trash2,
  ExternalLink,
  RefreshCw,
  Sparkles,
  CheckSquare,
  Clock,
  TrendingDown,
  TrendingUp,
  Phone,
  Mail,
} from "lucide-react";
import Link from "next/link";
import { qualityFieldLabel } from "@/lib/data-quality";
import { sourceMeta } from "@/lib/sources/source-meta";
import {
  cleanTitleConflicts,
  TITLE_UNCONFIRMED_LABEL,
} from "@/lib/intelligence/title-signal";

export type SavedCarStatus =
  | "active"
  | "price_drop"
  | "price_increase"
  | "ending_soon"
  | "unavailable"
  | "acquired"
  | "watching"
  | "passed"
  | "archived";

interface SavedCarCardProps {
  flipDesk?: boolean;
  comparisonSelected?: boolean;
  onToggleComparison?: () => void;
  save: {
    id: string;
    deal_id: string;
    status: SavedCarStatus;
    snapshot: {
      vin: string;
      year: number;
      make: string;
      model: string;
      trim?: string;
      odometer?: number;
      askingPrice?: number;
      marketValue?: number;
      estimatedProfit?: number;
      sellEstimate?: number;
      recommendedMaxBid?: number;
      repairEstimate?: number;
      transportEstimate?: number;
      profitScore?: number;
      images?: string[];
      locationCity?: string;
      locationState?: string;
      source?: string;
      seller?: string;
      sellerType?: string;
      sellerPhone?: string;
      sellerEmail?: string;
      sellerContactUrl?: string;
      sourceUrl?: string;
      titleType?: string;
      condition?: string;
      damageType?: string;
      lastSeenAt?: string;
      dataQuality?: {
        score: number;
        label: string;
        missing: string[];
      };
      trustExplanation?: {
        confidence?: string;
        score?: number;
        reasons?: string[];
        missing?: string[];
        nextChecks?: string[];
        summary?: string;
      };
    };
    source_name: string;
    source_url: string;
    price_at_save: number;
    last_price_seen: number;
    market_value_at_save: number;
    profit_at_save: number;
    saved_at: string;
    notes?: string;
    tags?: string[];
  };
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, newStatus: SavedCarStatus) => void;
}

export const SavedCarCard = React.memo(function SavedCarCard({
  save,
  flipDesk = false,
  comparisonSelected = false,
  onToggleComparison,
  onDelete,
  onUpdateStatus,
}: SavedCarCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { snapshot, status, price_at_save, last_price_seen, profit_at_save } =
    save;
  const originalPrice = Number(price_at_save || 0);
  const currentPrice = Number(last_price_seen || 0);
  const priceDiff = currentPrice - originalPrice;
  const profitValue = Number(snapshot.estimatedProfit ?? profit_at_save ?? 0);
  const lastSeenTime = snapshot.lastSeenAt
    ? new Date(snapshot.lastSeenAt).getTime()
    : NaN;
  const freshnessHours = Number.isFinite(lastSeenTime)
    ? Math.max(0, Math.round((Date.now() - lastSeenTime) / 3_600_000))
    : null;
  const hasEconomics =
    snapshot.sellEstimate != null ||
    snapshot.recommendedMaxBid != null ||
    snapshot.repairEstimate != null ||
    snapshot.transportEstimate != null ||
    profitValue !== 0;
  const weakQuality =
    snapshot.dataQuality != null &&
    Number(snapshot.dataQuality.score || 0) < 68;
  const staleListing = freshnessHours == null || freshnessHours > 24;
  const missingSourceLink = !save.source_url && !snapshot.sourceUrl;
  const sourceHref = snapshot.sourceUrl || save.source_url;
  const contactHref = snapshot.sellerContactUrl || sourceHref;
  const hasSellerContact = Boolean(
    snapshot.sellerPhone || snapshot.sellerEmail || contactHref,
  );
  const trustSummary =
    snapshot.trustExplanation?.summary ||
    snapshot.trustExplanation?.reasons?.slice(0, 3).join(" · ");
  const auctionListing = ["auction", "salvage", "wholesale", "gov"].includes(
    sourceMeta(save.source_name).channel,
  );
  const nextTrustChecks = (snapshot.trustExplanation?.nextChecks || []).filter(
    (check) => auctionListing || !/auction|bidding/i.test(check),
  );
  const missingFields = (snapshot.dataQuality?.missing || []).filter(
    (field) => auctionListing || !/auction/i.test(field),
  );
  const trustIssues = [
    weakQuality ? "listing details incomplete" : null,
    staleListing
      ? freshnessHours == null
        ? "last verified time unknown"
        : `last seen ${Math.round(freshnessHours / 24)}d ago`
      : null,
    missingSourceLink ? "source link missing" : null,
    flipDesk && !hasEconomics ? "cost estimate incomplete" : null,
  ].filter(Boolean) as string[];
  const trustState =
    status === "unavailable"
      ? {
          label: "Do not buy",
          detail: "Listing is no longer available. Use Find Similar instead.",
          tone: "border-[var(--rbd)] bg-[var(--rlo)] text-[var(--red)]",
        }
      : trustIssues.length === 0
        ? {
            label: "Ready to review",
            detail:
              "Listing details were seen recently. Confirm availability, title, condition, and final costs before purchase.",
            tone: "border-[var(--gbd)] bg-[var(--glo)] text-[var(--green)]",
          }
        : {
            label: "Verify before action",
            detail: `Check ${trustIssues.slice(0, 3).join(", ")}${
              trustIssues.length > 3 ? `, +${trustIssues.length - 3} more` : ""
            }.`,
            tone: "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]",
          };

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);
  const formatFreshness = (value?: string) => {
    if (!value) return "freshness unknown";
    const time = new Date(value).getTime();
    if (!Number.isFinite(time)) return "freshness unknown";
    const hours = Math.max(0, Math.round((Date.now() - time) / 3_600_000));
    if (hours < 1) return "seen just now";
    if (hours < 24) return `seen ${hours}h ago`;
    return `seen ${Math.round(hours / 24)}d ago`;
  };

  const getSourceBadgeColor = (src: string) => {
    const s = src.toLowerCase();
    if (s.includes("copart") || s.includes("iaa")) {
      return "text-[var(--orange)] border-none";
    }
    if (s.includes("craigslist") || s.includes("ebay")) {
      return "text-[var(--t4)] border-none";
    }
    if (s.includes("facebook")) {
      return "text-[var(--blue)] border-none";
    }
    if (s.includes("manual") || s.includes("camera") || s.includes("scan")) {
      return "text-[var(--green)] border-none";
    }
    return "text-[var(--purple)] border-none";
  };

  const handleAcquire = async () => {
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vin: snapshot.vin || "", // no fabricated VIN — can be filled in later
          year: snapshot.year,
          make: snapshot.make,
          model: snapshot.model,
          condition: "clean_title",
          purchasePrice: currentPrice || originalPrice,
          marketValue: snapshot.marketValue || 0,
          stage: "acquired",
        }),
      });
      if (res.ok) {
        onUpdateStatus(save.id, "acquired");
        toast.success("Added to fleet inventory");
      } else {
        const err = await res.json();
        toast.error("Failed to save to fleet");
      }
    } catch (e: any) {
      toast.error("Failed to save to fleet");
    }
  };

  return (
    <>
      <Card
        className={`relative border-none bg-[var(--s0)] transition-all overflow-hidden reveal-on-scroll ${
          status === "unavailable" ? "opacity-60 grayscale" : ""
        }`}
        style={{ boxShadow: "var(--shadow2)", borderRadius: "var(--r4)" }}
      >
        {onToggleComparison && (
          <label className="flex min-h-11 items-center gap-2 px-3 text-sm">
            <input
              type="checkbox"
              checked={comparisonSelected}
              onChange={onToggleComparison}
            />
            Compare this vehicle
          </label>
        )}
        {/* Banner for price_drop, ending_soon, unavailable */}
        {status === "price_drop" && (
          <div
            className="text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 flex items-center gap-1"
            style={{ background: "var(--green)" }}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            Price Drop &bull; Saved {formatMoney(originalPrice)} &rarr; Now{" "}
            {formatMoney(currentPrice)} ({formatMoney(Math.abs(priceDiff))}{" "}
            Off!)
          </div>
        )}
        {status === "price_increase" && (
          <div
            className="text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 flex items-center gap-1"
            style={{ background: "var(--red)" }}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Price Went Up &bull; Was {formatMoney(originalPrice)} &rarr; Now{" "}
            {formatMoney(currentPrice)}
          </div>
        )}
        {status === "ending_soon" && (
          <div
            className="text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 flex items-center gap-1"
            style={{ background: "var(--gold)" }}
          >
            <Clock className="w-3.5 h-3.5" />
            Auction Ends Soon &bull; Bid Closing Urgent
          </div>
        )}
        {status === "unavailable" && (
          <div
            className="text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 flex items-center gap-1"
            style={{ background: "var(--red)" }}
          >
            ✗ No Longer Available (Listing Removed / Sold)
          </div>
        )}
        {status === "acquired" && (
          <div
            className="text-white text-[10px] font-bold uppercase tracking-wider py-1.5 px-3 flex items-center gap-1"
            style={{ background: "var(--purple)" }}
          >
            ✓ Acquired &bull; Moved to Fleet Inventory
          </div>
        )}

        <CardContent className="p-5 flex flex-col sm:flex-row justify-between gap-4">
          {snapshot.images?.[0] && (
            <Link
              href={`/deal/${save.deal_id || ""}`}
              className="relative h-28 w-full shrink-0 overflow-hidden rounded-[var(--r3)] bg-[var(--s1)] sm:h-32 sm:w-44"
              aria-label={`Analyze ${snapshot.year} ${snapshot.make} ${snapshot.model}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={snapshot.images[0]}
                alt={`${snapshot.year} ${snapshot.make} ${snapshot.model}`}
                className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
              />
              <div className="absolute bottom-2 left-2 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-black uppercase text-white">
                {snapshot.images.length} photo
                {snapshot.images.length === 1 ? "" : "s"}
              </div>
            </Link>
          )}
          {/* Main Info */}
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={`text-[10px] font-bold ${getSourceBadgeColor(save.source_name)} px-2 py-0.5`}
                style={{ background: "var(--s1)" }}
              >
                {sourceMeta(save.source_name).label}{" "}
                {snapshot.locationCity
                  ? ` - ${snapshot.locationCity} ${snapshot.locationState || ""}`
                  : ""}
                {snapshot.sellerType ? ` · ${snapshot.sellerType}` : ""}
              </Badge>
              {flipDesk && snapshot.profitScore && (
                <Badge
                  className="text-white text-[10px] px-2 py-0.5 border-none font-bold"
                  style={{ background: "var(--grad)" }}
                >
                  Score {snapshot.profitScore}
                </Badge>
              )}
            </div>

            <h3 className="text-lg font-bold text-[var(--t1)] tracking-tight">
              {snapshot.year} {snapshot.make} {snapshot.model} {snapshot.trim}
            </h3>

            <p className="text-xs text-[var(--t4)]">
              {snapshot.odometer
                ? `${snapshot.odometer.toLocaleString()} mi`
                : ""}
              {snapshot.vin ? ` - VIN: ${snapshot.vin}` : ""}
            </p>
            <p className="text-[11px] leading-relaxed text-[var(--t4)]">
              Source proof:{" "}
              {sourceHref ? "original link saved" : "source link missing"} ·{" "}
              {formatFreshness(snapshot.lastSeenAt)}
            </p>
            {(snapshot.seller || hasSellerContact) && (
              <div className="flex flex-wrap items-center gap-2 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2 text-[11px] text-[var(--t3)]">
                <span className="font-black uppercase tracking-wide text-[var(--t5)]">
                  Seller
                </span>
                {snapshot.seller ? (
                  <span className="font-semibold text-[var(--t2)]">
                    {snapshot.seller}
                  </span>
                ) : null}
                {snapshot.sellerPhone ? (
                  <a
                    href={`tel:${snapshot.sellerPhone}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--s0)] px-2 py-1 font-bold text-[var(--t2)] hover:text-[var(--blue)]"
                  >
                    <Phone className="h-3 w-3" />
                    Call
                  </a>
                ) : null}
                {snapshot.sellerEmail ? (
                  <a
                    href={`mailto:${snapshot.sellerEmail}`}
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--s0)] px-2 py-1 font-bold text-[var(--t2)] hover:text-[var(--blue)]"
                  >
                    <Mail className="h-3 w-3" />
                    Email
                  </a>
                ) : null}
                {contactHref ? (
                  <a
                    href={contactHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-full bg-[var(--s0)] px-2 py-1 font-bold text-[var(--t2)] hover:text-[var(--blue)]"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Listing
                  </a>
                ) : null}
              </div>
            )}
            <div
              className={`rounded-[var(--r2)] border px-3 py-2 text-[11px] font-semibold leading-relaxed ${trustState.tone}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-black uppercase tracking-wide">
                  {trustState.label}
                </span>
                {freshnessHours != null ? (
                  <span className="font-mono">
                    {freshnessHours < 24
                      ? `seen ${freshnessHours}h ago`
                      : `${Math.round(freshnessHours / 24)}d old`}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-[var(--t3)]">{trustState.detail}</p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {snapshot.titleType && (
                <Badge
                  className="border-none text-[10px] font-bold uppercase"
                  style={{ background: "var(--s1)", color: "var(--t3)" }}
                >
                  {cleanTitleConflicts(snapshot.titleType, {
                    condition: snapshot.condition,
                    damageType: snapshot.damageType,
                  })
                    ? `${TITLE_UNCONFIRMED_LABEL} · repairable signals`
                    : `${snapshot.titleType.replace(/_/g, " ")} reported by listing`}
                </Badge>
              )}
              {snapshot.damageType && (
                <Badge
                  className="border-none text-[10px] font-bold uppercase"
                  style={{
                    background: "var(--amber-lo)",
                    color: "var(--amber-d)",
                  }}
                >
                  {snapshot.damageType.replace(/_/g, " ")} reported by listing
                </Badge>
              )}
            </div>
            {missingFields.length ? (
              <p className="text-[11px] leading-relaxed text-[var(--t4)]">
                Still needed:{" "}
                {missingFields.slice(0, 3).map(qualityFieldLabel).join(", ")}
              </p>
            ) : null}
            {flipDesk && trustSummary ? (
              <details className="text-[11px] leading-relaxed text-[var(--t3)]">
                <summary className="cursor-pointer font-semibold">
                  Listing notes
                </summary>
                {trustSummary}
                {nextTrustChecks.length ? (
                  <div className="mt-1 text-[var(--t4)]">
                    Verify {nextTrustChecks.slice(0, 3).join(", ")}
                  </div>
                ) : null}
              </details>
            ) : null}
            {(snapshot.sellEstimate ||
              snapshot.recommendedMaxBid ||
              snapshot.repairEstimate ||
              snapshot.transportEstimate) && (
              <div className="flex flex-wrap gap-1.5">
                {flipDesk && snapshot.sellEstimate ? (
                  <Badge
                    className="border-none text-[10px] font-bold uppercase"
                    style={{ background: "var(--glo)", color: "var(--green)" }}
                  >
                    Sell {formatMoney(snapshot.sellEstimate)}
                  </Badge>
                ) : null}
                {flipDesk && snapshot.recommendedMaxBid ? (
                  <Badge
                    className="border-none text-[10px] font-bold uppercase"
                    style={{ background: "var(--blo)", color: "var(--blue)" }}
                  >
                    Max bid {formatMoney(snapshot.recommendedMaxBid)}
                  </Badge>
                ) : null}
                {snapshot.repairEstimate ? (
                  <Badge
                    className="border-none text-[10px] font-bold uppercase"
                    style={{ background: "var(--s1)", color: "var(--t3)" }}
                  >
                    Repair {formatMoney(snapshot.repairEstimate)}
                  </Badge>
                ) : null}
                {snapshot.transportEstimate ? (
                  <Badge
                    className="border-none text-[10px] font-bold uppercase"
                    style={{ background: "var(--s1)", color: "var(--t3)" }}
                  >
                    Transport {formatMoney(snapshot.transportEstimate)}
                  </Badge>
                ) : null}
              </div>
            )}

            {save.notes && (
              <p
                className="text-xs italic text-[var(--t3)] p-2 rounded-lg"
                style={{ background: "var(--s1)" }}
              >
                Note: "{save.notes}"
              </p>
            )}
          </div>

          {/* Pricing & Actions */}
          <div className="flex flex-col sm:items-end justify-between gap-4 min-w-[160px]">
            <div className="text-left sm:text-right">
              {status === "unavailable" ? (
                <>
                  <span className="text-xs text-[var(--t4)] block uppercase font-bold tracking-wider">
                    Was listed at
                  </span>
                  <span className="text-lg font-bold text-[var(--t2)]">
                    {formatMoney(originalPrice)}
                  </span>
                </>
              ) : (
                <>
                  <span className="text-xs text-[var(--t4)] block uppercase font-bold tracking-wider">
                    Price
                  </span>
                  <div className="flex items-baseline gap-2">
                    {priceDiff !== 0 && (
                      <span className="text-xs text-[var(--t4)] line-through">
                        {formatMoney(originalPrice)}
                      </span>
                    )}
                    <span className="text-xl font-bold text-[var(--t1)]">
                      {formatMoney(currentPrice)}
                    </span>
                  </div>
                  {flipDesk && (
                    <span
                      className={`text-xs font-bold block mt-0.5 ${
                        profitValue >= 0
                          ? "text-[var(--green)]"
                          : "text-[var(--red)]"
                      }`}
                    >
                      Est. Profit: {profitValue >= 0 ? "+" : ""}
                      {formatMoney(profitValue)}
                    </span>
                  )}
                </>
              )}
            </div>

            {/* Actions Footer */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Primary Action */}
              {status === "unavailable" ? (
                <Button
                  size="sm"
                  onClick={() => setModalOpen(true)}
                  className="text-white font-bold text-xs px-3 h-8 border-none flex items-center gap-1.5 rounded-lg"
                  style={{ background: "var(--t1)" }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Find Similar
                </Button>
              ) : status === "acquired" ? (
                <Link href="/fleet" className="w-full sm:w-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-[var(--purple)] font-bold text-xs px-3 h-8 border-none flex items-center gap-1.5 rounded-lg"
                    style={{ background: "var(--plo)" }}
                  >
                    {flipDesk ? "View in Fleet" : "View purchase"}
                  </Button>
                </Link>
              ) : (
                <>
                  <Link
                    href={`/deal/${save.deal_id || ""}`}
                    className="w-full sm:w-auto"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-[var(--t2)] font-bold text-xs px-3 h-8 border-none flex items-center gap-1.5 rounded-lg"
                      style={{ background: "var(--s1)" }}
                    >
                      Analyze
                    </Button>
                  </Link>

                  {flipDesk && profitValue > 0 ? (
                    <Button
                      size="sm"
                      onClick={handleAcquire}
                      className="text-white font-bold text-xs px-3 h-8 border-none flex items-center gap-1.5 rounded-lg"
                      style={{ background: "var(--grad)" }}
                    >
                      <CheckSquare className="w-3.5 h-3.5" />
                      Record purchase
                    </Button>
                  ) : (
                    <span className="rounded-lg border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2 text-[10px] font-black text-[var(--amber-d)]">
                      {flipDesk
                        ? "Review price and costs"
                        : "Check condition and total cost"}
                    </span>
                  )}
                </>
              )}

              {/* Delete Icon */}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(save.id)}
                className="text-[var(--red)] p-2 h-8 w-8 rounded-lg flex items-center justify-center transition-colors border-none hover:bg-[var(--rlo)]"
                title="Remove Saved Car"
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              {save.source_url && (
                <a
                  href={save.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 h-8 w-8 rounded-lg text-[var(--t3)] hover:text-[var(--t1)] flex items-center justify-center transition-colors"
                  style={{ background: "var(--s1)" }}
                  title="Open Original Listing"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <FindSimilarModal
        flipDesk={flipDesk}
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        snapshot={snapshot as any}
      />
    </>
  );
});
