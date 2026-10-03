"use client";

import Link from "next/link";
import { Database, KeyRound, RadioTower, Settings } from "lucide-react";

export function SetupStatusPanel({
  configured,
  previewMode,
  previewCount = 0,
}: {
  configured?: boolean;
  previewMode?: boolean;
  previewCount?: number;
}) {
  if (configured) return null;
  const hasPreviewRows = previewMode && previewCount > 0;

  const items = [
    {
      icon: Database,
      label: "Inventory database",
      status: "Not connected",
      detail: hasPreviewRows
        ? `${previewCount.toLocaleString()} real public preview rows are showing, but they are not saved yet.`
        : previewMode
          ? "Public preview sources are reachable, but this exact scope has no matching rows yet."
          : "Supabase is missing or has no live rows.",
    },
    {
      icon: RadioTower,
      label: "Source ingestion",
      status: previewMode ? "Preview feed active" : "No active feed",
      detail: hasPreviewRows
        ? "GovDeals/PublicSurplus are live-previewed now; protected imports still need Supabase."
        : previewMode
          ? "GovDeals/PublicSurplus responded. Broaden the state, lane, budget, or vehicle type to see matches."
          : "Salvage, wholesale, private, retail, repo, and specialty sources need credentials or jobs.",
    },
    {
      icon: KeyRound,
      label: "AI provider",
      status: "Deterministic mode",
      detail:
        "Deal math, decision briefs, and market pulse can run from app data; generated AI needs a provider key.",
    },
  ];

  return (
    <section className="glass-panel p-4 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Setup required
          </p>
          <h2 className="text-lg font-black text-[var(--t1)]">
            {hasPreviewRows
              ? "Real preview inventory is live. Saved inventory is not connected yet."
              : previewMode
                ? "Preview sources are reachable. This scope has no matching rows yet."
                : "Searches are ready. Real inventory is not connected yet."}
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
            {hasPreviewRows
              ? "Users can browse public live listings now. Connect Supabase to save rows, run imports, personalize feeds, and track freshness over time."
              : previewMode
                ? "The app is checking real public sources and keeping the result honest. Connect Supabase and gated sources to expand coverage beyond the public preview."
                : "The app can organize and filter deals now, but results will stay empty until live vehicle data is feeding the database."}
          </p>
        </div>
        <Link
          href="/sources"
          className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)]"
        >
          <Settings size={15} />
          Data sources
        </Link>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.label}
              className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3"
            >
              <div className="flex items-center gap-2">
                <Icon size={15} className="text-[var(--t4)]" />
                <span className="text-sm font-bold text-[var(--t1)]">
                  {item.label}
                </span>
              </div>
              <div className="mt-2 text-xs font-bold text-[var(--amber-d)]">
                {item.status}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
                {item.detail}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
