"use client";

import Link from "next/link";
import { motion } from "framer-motion";

// Early access, stated plainly: no spot counters, countdowns, join counts, or testimonials.
// Customer upgrades are free; the legacy checkout redirects to workspace options.
// Joining means creating an account; the auth pages send a
// new account to /onboarding and an onboarded one to /discover.

const BETA_FEATURES = [
  {
    title: "Saved searches & alerts",
    description:
      "Save what you are looking for and get told when a matching listing shows up or changes price.",
  },
  {
    title: "Listings with ask, source and when seen",
    description:
      "Every listing shows the asking price, where it came from, and when we last saw it.",
  },
  {
    title: "Deal check without invented profit",
    description:
      "Review an offer's entered or extracted costs and the details to confirm before you buy.",
  },
] as const;

const ASKS = [
  "Use it for real searches and tell us when a listing looks wrong or stale.",
  "Expect rough edges. Features and sources change while we test.",
  "Send feedback to support@MikeHunt.pro. A short note is plenty.",
];

export default function BetaAccessPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--s0)" }}>
      <div className="max-w-3xl mx-auto px-4 py-12 md:py-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div
            className="inline-block mb-4 px-4 py-2 rounded-full text-sm font-bold"
            style={{ background: "var(--amber-lo)", color: "var(--amber-d)" }}
          >
            Early access
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-[var(--t1)] mb-4 leading-tight">
            Find cars worth checking — real asking prices and sources
          </h1>
          <p className="text-lg md:text-xl text-[var(--t3)] max-w-2xl mx-auto">
            Connect inventory and valuation tools you already trust.
          </p>
        </motion.div>

        <div className="grid gap-4 md:grid-cols-3 mb-10">
          {BETA_FEATURES.map((feature) => (
            <div key={feature.title} className="glass-panel p-5">
              <h2 className="text-base font-bold text-[var(--t1)] mb-2">
                {feature.title}
              </h2>
              <p className="text-sm text-[var(--t3)]">{feature.description}</p>
            </div>
          ))}
        </div>

        <div className="glass-panel p-6 mb-6">
          <h2 className="text-lg font-bold text-[var(--t1)] mb-3">
            Where the data comes from
          </h2>
          <p className="text-sm text-[var(--t3)]">
            Listings come from public marketplace and auction pages and from the
            inventory and valuation sources you connect. We show the asking
            price and source as we found them. Coverage depends on which sources
            are reachable in your area, so some searches will be thin.
          </p>
        </div>

        <div className="glass-panel p-6 mb-10">
          <h2 className="text-lg font-bold text-[var(--t1)] mb-3">
            What we ask of testers
          </h2>
          <ul className="space-y-2 text-sm text-[var(--t3)] list-disc pl-5">
            {ASKS.map((ask) => (
              <li key={ask}>{ask}</li>
            ))}
          </ul>
        </div>

        <div className="text-center">
          <Link
            href="/register"
            className="inline-flex w-full max-w-md justify-center py-4 rounded-[var(--r3)] text-lg font-black text-black"
            style={{ background: "var(--grad)" }}
          >
            Join early access
          </Link>
          <p className="mt-3 text-sm text-[var(--t4)]">
            Already have an account?{" "}
            <Link href="/login" className="underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
