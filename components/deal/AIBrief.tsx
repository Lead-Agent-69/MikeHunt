"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { motion, AnimatePresence } from "framer-motion";
import { Ico } from "@/components/shared/Ico";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

/**
 * AI deal brief — a plain-English "why this verdict + risks + what to verify", generated on demand
 * from the deal's own numbers. Generation is an explicit click (no tokens on a plain view); once
 * made, it's cached server-side and shows automatically next time.
 */
export function AIBrief({ dealId }: { dealId: string }) {
  const { data, mutate } = useSWR(`/api/deals/${dealId}/brief`, fetcher, {
    revalidateOnFocus: false,
  });
  const [generating, setGenerating] = useState(false);

  // Nothing to show and no provider configured → hide entirely.
  if (data && !data.brief && data.canGenerate === false && !data.reason)
    return null;

  async function generate() {
    setGenerating(true);
    try {
      const res = await fetch(`/api/deals/${dealId}/brief?generate=1`).then(
        (r) => r.json(),
      );
      mutate(res, false);
    } finally {
      setGenerating(false);
    }
  }

  const brief: string | null = data?.brief ?? null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-5 mt-4 relative overflow-hidden"
    >
      {/* Subtle animated gradient background for the intelligence feel */}
      <div className="absolute -inset-2 bg-gradient-to-br from-[var(--amber-lo)] to-transparent opacity-20 blur-2xl pointer-events-none" />

      <div className="relative flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Ico name="bot" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            AI Brief
          </p>
        </div>
        {brief && (
          <button
            onClick={generate}
            disabled={generating}
            className="text-[11px] font-semibold text-[var(--t4)] hover:text-[var(--amber)] disabled:opacity-50"
          >
            {generating ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      <AnimatePresence mode="wait">
        {brief ? (
          <motion.div
            key="brief-content"
            initial={{ opacity: 0, filter: "blur(4px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ duration: 0.5, staggerChildren: 0.1 }}
            className="text-sm text-[var(--t2)] whitespace-pre-line leading-relaxed"
          >
            {brief.split("\n\n").map((para, idx) => (
              <motion.p
                key={idx}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className="mb-3 last:mb-0"
              >
                {para}
              </motion.p>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="brief-empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center justify-between gap-3 relative"
          >
            <p className="text-sm text-[var(--t4)]">
              Get a plain-English read on the verdict, the real risks, and what
              to verify before bidding.
            </p>
            <button
              onClick={generate}
              disabled={generating}
              className="shrink-0 px-4 py-2 rounded-[var(--r3)] font-bold text-sm text-white disabled:opacity-50"
              style={{ background: "var(--grad)" }}
            >
              {generating ? "Analyzing…" : "Generate"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
