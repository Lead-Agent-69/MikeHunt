"use client";

import React from "react";
import useSWR from "swr";
import { motion } from "framer-motion";
import { DiscoveryCard } from "./DiscoveryCard";

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("failed");
    return res.json();
  });

/**
 * Generic intelligence rail — fetches an endpoint that returns { deals: DiscoveryDeal[] } and renders
 * them with the standard DiscoveryCard. Used by the Deal IQ surfaces (recommendations, mispricing).
 * Renders nothing when empty.
 */
export function IntelRail({
  endpoint,
  title,
  subtitle,
}: {
  endpoint: string;
  title: string;
  subtitle?: string;
}) {
  const { data, error } = useSWR(endpoint, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const deals: any[] = data?.deals ?? [];
  if (error || deals.length === 0) return null;

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
          {title}
        </h2>
        {subtitle && (
          <p className="mt-0.5 text-xs text-[var(--t4)]">{subtitle}</p>
        )}
      </div>
      <motion.div
        className="scrollbar-hide -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6"
        style={{
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {deals.map((deal) => (
          <DiscoveryCard key={`${endpoint}-${deal.id}`} deal={deal} />
        ))}
      </motion.div>
    </motion.section>
  );
}
