"use client";

import React from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
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
  const { data, error, mutate, isValidating } = useSWR(endpoint, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const deals: any[] = data?.deals ?? [];
  if (data?.needsSignIn || data?.needsState || data?.needsLocation)
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-[var(--t1)]">{title}</h2>
        <p className="text-sm text-[var(--t3)]">
          {data.needsSignIn
            ? "Sign in again to see vehicles near you."
            : data.needsState
              ? "Choose your home state to see vehicles near you."
              : "Add your home ZIP to search within your selected distance."}
        </p>
        <Link
          href={data.needsSignIn ? "/login?next=%2Fdiscover" : "/settings"}
          className="inline-flex min-h-11 items-center text-sm underline text-[var(--t2)]"
        >
          {data.needsSignIn ? "Sign in" : "Update home location"}
        </Link>
      </section>
    );
  const recovery = error ? (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[var(--t2)]"
    >
      <p>
        {deals.length
          ? "Could not refresh these vehicles. Your previous results are still here."
          : "Could not load these vehicles. Please try again."}
      </p>
      <button
        type="button"
        onClick={() => void mutate().catch(() => {})}
        disabled={isValidating}
        className="inline-flex min-h-11 items-center gap-2 text-[var(--accent)] disabled:opacity-60"
      >
        <RefreshCw size={16} aria-hidden="true" />
        {isValidating ? "Trying again" : "Try again"}
      </button>
    </div>
  ) : null;
  if (deals.length === 0)
    return recovery ? (
      <section className="space-y-2">
        <h2 className="text-lg font-bold text-[var(--t1)]">{title}</h2>
        {recovery}
      </section>
    ) : null;

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
      {recovery}
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
