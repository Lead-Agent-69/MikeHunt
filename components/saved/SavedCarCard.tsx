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
} from "lucide-react";
import Link from "next/link";

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
      profitScore?: number;
      images?: string[];
      locationCity?: string;
      locationState?: string;
      source?: string;
      sourceUrl?: string;
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
  onDelete,
  onUpdateStatus,
}: SavedCarCardProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const { snapshot, status, price_at_save, last_price_seen, profit_at_save } =
    save;
  const originalPrice = Number(price_at_save || 0);
  const currentPrice = Number(last_price_seen || 0);
  const priceDiff = currentPrice - originalPrice;

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

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
          {/* Main Info */}
          <div className="space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={`text-[10px] font-bold ${getSourceBadgeColor(save.source_name)} px-2 py-0.5`}
                style={{ background: "var(--s1)" }}
              >
                from {save.source_name.toUpperCase()}{" "}
                {snapshot.locationCity
                  ? `&bull; ${snapshot.locationCity} ${snapshot.locationState || ""}`
                  : ""}
              </Badge>
              {snapshot.profitScore && (
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
              {snapshot.vin ? ` &bull; VIN: ${snapshot.vin}` : ""}
            </p>

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
                  <span className="text-xs text-[var(--green)] font-bold block mt-0.5">
                    Est. Profit: +
                    {formatMoney(snapshot.estimatedProfit || profit_at_save)}
                  </span>
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
                    View in Fleet
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

                  <Button
                    size="sm"
                    onClick={handleAcquire}
                    className="text-white font-bold text-xs px-3 h-8 border-none flex items-center gap-1.5 rounded-lg"
                    style={{ background: "var(--grad)" }}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    Buy
                  </Button>
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
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        snapshot={snapshot as any}
      />
    </>
  );
});
