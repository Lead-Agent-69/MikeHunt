"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { DiscoveryCard } from "./DiscoveryCard";
import type { DiscoveryDeal } from "./types";

interface FlashDeal extends DiscoveryDeal {
  secondsRemaining: number | null;
  belowMarketPct: number | null;
}

interface FlashResponse {
  deals: FlashDeal[];
  count: number;
  state: string;
}

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load flash deals");
    return res.json();
  });

// Turn seconds remaining into a compact "Hh Mm" / "Mm" countdown.
function formatRemaining(seconds: number): string {
  if (seconds <= 0) return "Ending";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

function CountdownChip({ initialSeconds }: { initialSeconds: number | null }) {
  const [remaining, setRemaining] = useState(initialSeconds ?? 0);

  useEffect(() => {
    setRemaining(initialSeconds ?? 0);
  }, [initialSeconds]);

  // Recompute every 60s — the feed represents "new in the last 24h", so minute resolution is fine.
  useEffect(() => {
    if (initialSeconds == null) return;
    const id = setInterval(() => {
      setRemaining((s) => Math.max(0, s - 60));
    }, 60_000);
    return () => clearInterval(id);
  }, [initialSeconds]);

  if (initialSeconds == null) return null;

  return (
    <div
      className="pointer-events-none absolute right-2.5 top-2.5 z-10 rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
      style={{ background: "rgba(20,10,20,0.72)", backdropFilter: "blur(8px)" }}
    >
      ⏳ {formatRemaining(remaining)}
    </div>
  );
}

/**
 * Flash Deals rail — a pinned, urgency-styled strip at the top of Discover. Fresh-to-market GO deals
 * priced well below resale, each with a live countdown to its 24h cutoff. Renders nothing when empty.
 */
export function FlashRail({ state }: { state?: string }) {
  const { data, error } = useSWR<FlashResponse>(
    `/api/flash-deals${state ? `?state=${state}` : ""}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  if (error || !data || data.deals.length === 0) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="space-y-3"
    >
      <div className="px-1">
        <h2 className="text-lg font-bold leading-tight text-[var(--t1)]">
          🔥 Flash Deals
        </h2>
        <p className="mt-0.5 text-xs text-[var(--t4)]">
          New to market &amp; 10%+ below resale — moving fast
        </p>
      </div>
      <motion.div
        className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {data.deals.map((deal) => (
          <div
            key={`flash-${deal.id}`}
            className="relative"
            style={{ flex: "0 0 auto" }}
          >
            <CountdownChip initialSeconds={deal.secondsRemaining} />
            <DiscoveryCard deal={deal} />
          </div>
        ))}
      </motion.div>
    </motion.section>
  );
}
