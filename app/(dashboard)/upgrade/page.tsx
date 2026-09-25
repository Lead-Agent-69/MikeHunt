"use client";

import React, { useState } from "react";
import Link from "next/link";

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

export default function UpgradePage() {
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
      else setError(json.error || "Could not start checkout.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-10"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black text-[var(--t1)] mb-1">
          Upgrade DealerHunt Pro
        </h1>
        <p className="text-[var(--t3)]">
          Every plan profits you more than it costs. Cancel anytime.
        </p>
      </div>

      {error && (
        <div className="glass-panel p-3 text-center text-[var(--red)] text-sm mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className="glass-panel p-5 flex flex-col"
            style={
              p.highlight
                ? { borderColor: "var(--amber-bd)", borderWidth: 1.5 }
                : undefined
            }
          >
            {p.highlight && (
              <span className="text-[10px] font-bold text-[var(--amber-d)] uppercase tracking-widest mb-1">
                Most popular
              </span>
            )}
            <p className="text-sm font-bold text-[var(--t1)]">{p.name}</p>
            <p className="mt-1 mb-4">
              <span className="text-3xl font-black text-[var(--t1)]">
                {p.price}
              </span>
              <span className="text-sm text-[var(--t4)]">{p.cadence}</span>
            </p>
            <ul className="space-y-1.5 flex-1 mb-4">
              {p.features.map((f) => (
                <li key={f} className="text-xs text-[var(--t2)] flex gap-1.5">
                  <span className="text-[var(--green)]">✓</span> {f}
                </li>
              ))}
            </ul>
            {p.id === "free" ? (
              <button
                disabled
                className="w-full py-2 rounded-[var(--r3)] text-sm font-bold bg-[var(--s2)] text-[var(--t4)]"
              >
                {p.cta}
              </button>
            ) : (
              <button
                onClick={() => checkout(p.id)}
                disabled={busy === p.id}
                className="w-full py-2 rounded-[var(--r3)] text-sm font-bold text-white disabled:opacity-50"
                style={{
                  background: p.highlight ? "var(--grad)" : "var(--t1)",
                }}
              >
                {busy === p.id ? "Starting…" : p.cta}
              </button>
            )}
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-[var(--t4)] mt-6">
        Billing activates once Stripe keys are configured. See your{" "}
        <Link href="/changelog" className="text-[var(--amber)]">
          changelog
        </Link>
        .
      </p>
    </div>
  );
}
