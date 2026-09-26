"use client";

import React, { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";

const FALLBACK_CHANGELOG = [
  {
    id: "v2.5.0",
    title: "v2.5.0 — The Next Best Buy AI Capital Sniper & Operations Overhaul",
    published_at: "2026-09-26T00:00:00Z",
    is_major: true,
    body: "Major enterprise release introducing capital-optimized deal sniping, multi-modal Gemini Vision damage inspection, autonomous seller negotiations, real-time freight and DMV tax calculations, and a complete admin operations center.",
    features: [
      "AI Next Best Buy Sniper (/best-buy): Instantly calculates the #1 highest-margin flip for your exact available cash with days-to-turn velocity scoring.",
      "Gemini Vision Damage Inspector: Neural network scans listing photos for hidden collision damage, airbag deployment, rust, and panel gaps.",
      "Autonomous Seller Negotiator: Dynamic cash-offer scripts and automated SMS outreach based on dealer-set margin boundaries.",
      "Interstate Freight & DMV Tax Engine: Live Central Dispatch hauling rates and 50-state DMV title and sales tax calculations.",
      "Admin Operations Command Center (/admin): Live deal inventory, scraper telemetry, user analytics, and one-click bulk rescore runner.",
      "Stripe Webhook Cancellation Handling: Automated tier downgrades on subscription deletion and real-time plan status synchronization.",
      "Legal Compliance Suite: Full Terms of Service (/tos) and CCPA/GDPR Privacy Policy (/privacy).",
    ],
  },
  {
    id: "v2.4.0",
    title: "v2.4.0 — High-Contrast Lane Mode & Mobile Barcode Scanner",
    published_at: "2026-09-25T00:00:00Z",
    is_major: true,
    body: "Designed for live in-person dealer auctions with sub-200ms door jamb barcode scanning and audio HUD alerts in direct sunlight.",
    features: [
      "Camera Barcode & OCR VIN Scanner: Point-and-shoot VIN extraction from door jamb stickers.",
      "High-Contrast OLED HUD: Built for visibility in glaring outdoor auction conditions.",
      "Voice & Audio Verdict Alerts: Instant 'BUY' or 'PASS' sound chimes.",
    ],
  },
  {
    id: "v2.3.0",
    title: "v2.3.0 — Liquid Glass UI & Framer Marketplace Components",
    published_at: "2026-09-24T00:00:00Z",
    is_major: false,
    body: "Complete aesthetic redesign utilizing frosted glassmorphism, 3D card tilts, liquid buttons, and responsive micro-animations.",
    features: [
      "Framer Marketplace Liquid Glass design system.",
      "Interactive 3D Card Tilts and Spotlight overlays.",
      "Profit Simulator and dynamic ROI projection drawer.",
    ],
  },
];

export default function ChangelogPage() {
  const supabase = createClientComponentClient();
  const [entries, setEntries] = useState<any[]>(FALLBACK_CHANGELOG);

  useEffect(() => {
    supabase
      .from("changelog")
      .select("*")
      .order("published_at", { ascending: false })
      .then(({ data }) => {
        if (data && data.length > 0) setEntries(data);
      });
  }, []);

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-12"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <h1 className="text-3xl font-black text-[var(--t1)] mb-1">Changelog</h1>
      <p className="text-[var(--t3)] mb-10">Every update to MikeHunt Pro.</p>

      {entries.length === 0 && (
        <div className="glass-panel p-8 text-center text-[var(--t4)] text-sm">
          No updates published yet.
        </div>
      )}

      <div className="space-y-10">
        {entries.map((e) => (
          <div key={e.id} className="border-l-2 border-[var(--b2)] pl-5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[var(--t4)] font-mono">
                {e.published_at
                  ? new Date(e.published_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : ""}
              </span>
              {e.is_major && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: "var(--amber-lo)",
                    color: "var(--amber-d)",
                  }}
                >
                  major
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-[var(--t1)] mb-1">
              {e.title}
            </h2>
            {e.body && (
              <p className="text-sm text-[var(--t3)] mb-2">{e.body}</p>
            )}
            {e.features?.length > 0 && (
              <ul className="space-y-1">
                {e.features.map((f: string, i: number) => (
                  <li key={i} className="text-sm text-[var(--t2)] flex gap-2">
                    <span className="text-[var(--green)]">+</span> {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
