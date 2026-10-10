"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";
import {
  GradientText,
  ShineBorder,
  Spotlight,
} from "@/components/ui/premium-visuals";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

// Static plan display (amounts/features). Checkout resolves price IDs server-side from the plan id.
const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    cadence: "",
    features: [
      "10 VIN lookups/day",
      "3 saved searches",
      "GO/HOLD/PASS verdicts",
    ],
    cta: "Current plan",
  },
  {
    id: "pro",
    name: "Pro",
    price: "$29",
    cadence: "/mo",
    highlight: true,
    features: [
      "Unlimited lookups",
      "Unlimited alerts",
      "Deal Check",
      "Price history + timing",
      "Deal IQ + calibration",
    ],
    cta: "Upgrade to Pro",
  },
  {
    id: "pro_plus",
    name: "Pro Plus",
    price: "$79",
    cadence: "/mo",
    features: [
      "Everything in Pro",
      "Bulk/fleet sourcing",
      "Parts intelligence",
      "Public API access",
    ],
    cta: "Go Pro Plus",
  },
  {
    id: "lifetime",
    name: "Lifetime",
    price: "$499",
    cadence: " once",
    features: ["Everything, forever", "All future features"],
    cta: "Buy Lifetime",
  },
];

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 260, damping: 26 },
  },
};

export default function UpgradePage() {
  const { intent } = useBuyerIntent();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkout(plan: string) {
    setBusy(plan);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const json = await res.json();
      if (json.url) window.location.href = json.url;
      else
        setError(
          userFacingErrorMessage(
            json.error,
            "We couldn't start checkout. Please try again.",
          ),
        );
    } catch (e: any) {
      setError(
        userFacingErrorMessage(
          e,
          "We couldn't start checkout. Please try again.",
        ),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-10">
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <h1 className="text-4xl font-black mb-1">
          <GradientText>Upgrade MikeHunt Pro</GradientText>
        </h1>
        <p className="text-[var(--t3)]">
          {isFlipBuyerMode(intent?.buyerMode)
            ? "Every plan profits you more than it costs. Cancel anytime."
            : "Pick the plan that fits how you buy. Cancel anytime."}
        </p>
      </motion.div>

      {error && (
        <div className="glass-panel p-3 text-center text-[var(--red)] text-sm mb-6">
          {error}
        </div>
      )}

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        initial="hidden"
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.08 } } }}
      >
        {PLANS.map((p) => {
          const card = (
            <div
              className="glass-panel relative h-full p-5 flex flex-col overflow-hidden"
              style={
                p.highlight
                  ? { borderColor: "var(--amber-bd)", borderWidth: 1.5 }
                  : undefined
              }
            >
              {p.highlight && <Spotlight />}
              {p.highlight && (
                <span className="relative text-[10px] font-bold text-[var(--amber-d)] uppercase tracking-widest mb-1">
                  Most popular
                </span>
              )}
              <p className="relative text-sm font-bold text-[var(--t1)]">
                {p.name}
              </p>
              <p className="relative mt-1 mb-4">
                <span className="text-3xl font-black text-[var(--t1)]">
                  {p.price}
                </span>
                <span className="text-sm text-[var(--t4)]">{p.cadence}</span>
              </p>
              <ul className="relative space-y-1.5 flex-1 mb-4">
                {p.features.map((f) => (
                  <li key={f} className="text-xs text-[var(--t2)] flex gap-1.5">
                    <span className="text-[var(--green)]">✓</span> {f}
                  </li>
                ))}
              </ul>
              {p.id === "free" ? (
                <button
                  disabled
                  className="relative w-full py-2 rounded-[var(--r3)] text-sm font-bold bg-[var(--s2)] text-[var(--t4)]"
                >
                  {p.cta}
                </button>
              ) : (
                <motion.button
                  onClick={() => checkout(p.id)}
                  disabled={busy === p.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  className="relative w-full py-2 rounded-[var(--r3)] text-sm font-bold text-white disabled:opacity-50"
                  style={{
                    background: p.highlight ? "var(--grad)" : "var(--t1)",
                    boxShadow: p.highlight
                      ? "0 6px 20px var(--amber-lo)"
                      : "var(--shadow2)",
                  }}
                >
                  {busy === p.id ? "Starting…" : p.cta}
                </motion.button>
              )}
            </div>
          );

          return (
            <motion.div
              key={p.id}
              variants={cardVariants}
              whileHover={{ y: -5 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
              className="h-full"
            >
              {p.highlight ? (
                <ShineBorder
                  className="h-full rounded-[var(--r4)]"
                  color={["var(--amber)", "var(--purple)", "var(--coral)"]}
                >
                  {card}
                </ShineBorder>
              ) : (
                card
              )}
            </motion.div>
          );
        })}
      </motion.div>

      <p className="text-center text-xs text-[var(--t4)] mt-6">
        Paid plans aren&apos;t available yet. See the{" "}
        <Link href="/changelog" className="text-[var(--amber)]">
          changelog
        </Link>{" "}
        for what&apos;s new.
      </p>
    </div>
  );
}
