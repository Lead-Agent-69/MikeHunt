"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, Plus, ExternalLink, Sparkles, Loader2 } from "lucide-react";
import Link from "next/link";

interface AcquireButtonProps {
  deal: {
    id: string;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    askPrice?: number;
    trueNetProfit?: number;
    sellEstimate?: number;
    locationCity?: string;
    locationState?: string;
  };
  className?: string;
}

export function AcquireToPipelineButton({ deal, className = "" }: AcquireButtonProps) {
  const [loading, setLoading] = useState(false);
  const [acquired, setAcquired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAcquire() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId: deal.id,
          vin: deal.vin || `UNASSIGNED-${deal.id.slice(0, 8)}`,
          year: deal.year || new Date().getFullYear(),
          make: deal.make || "Unknown",
          model: deal.model || "Unknown",
          trim: deal.trim,
          purchasePrice: deal.askPrice || 0,
          stage: "acquired",
          predictedProfit: deal.trueNetProfit,
          predictedSell: deal.sellEstimate,
          purchasedCity: deal.locationCity,
          purchasedState: deal.locationState,
          notes: `Acquired via MikeHunt Deal IQ on ${new Date().toLocaleDateString()}`,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to add vehicle to fleet pipeline");
      }

      setAcquired(true);
    } catch (err: any) {
      console.error("Acquisition error:", err);
      setError(err.message || "Could not acquire");
    } finally {
      setLoading(false);
    }
  }

  if (acquired) {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs font-black text-emerald-400">
          <Check className="h-4 w-4 text-emerald-400 stroke-[3]" />
          Acquired to Fleet
        </span>
        <Link
          href="/fleet"
          className="flex items-center gap-1 px-3 py-2 rounded-2xl bg-[var(--s1)] border border-[var(--b2)] text-xs font-bold text-[var(--t1)] hover:border-emerald-500/40 transition-colors"
        >
          View in Pipeline
          <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleAcquire}
        disabled={loading}
        className={`flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-black text-black bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 shadow-lg shadow-green-500/25 transition-all disabled:opacity-50 ${className}`}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin text-black" />
            Pushing to Pipeline...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4 fill-black" />
            Acquire &amp; Push to Fleet
          </>
        )}
      </motion.button>
      {error && <span className="text-[10px] text-[var(--red)] font-semibold">{error}</span>}
    </div>
  );
}
