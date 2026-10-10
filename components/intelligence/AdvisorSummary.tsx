"use client";

import React, { useState } from "react";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA,
  NOT_ENOUGH_DATA_YET,
  NOT_LIVE,
} from "@/lib/intelligence/advisor-view";
import { VerdictPill, money } from "@/components/intelligence/AdvisorCard";
import { useAdvisorRead } from "@/hooks/useAdvisorRead";
import { usePreferences } from "@/hooks/usePreferences";
import { readLocalBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { effectiveHome } from "@/lib/preferences/locations";

// Compact advisor line for DealCard. It's tap-to-check: /api/check-listing is rate limited
// (10/min), so a list of cards never fires one request each. After the tap it shows the verdict
// pill, "Buy at or under $X" and fair value (profit too on flip desks), or "Not enough data".
// It never shows a guess.
//
// The tap sends POST /api/check-listing with { dealId } (the server reads the stored row; no
// scrape). TODO(advisor-auto-show): #254 added POST /api/check-listing/batch (1–20 dealIds,
// 30/min, cached 10 min), so list cards could now show the read without a tap. Sara's call is
// tap-to-check for now; switch to one batch call per visible page only if Jonah or Sara approve.

export function AdvisorSummary({
  deal,
  flipDesk,
}: {
  deal: Record<string, unknown>;
  /** The card's own desk prop. Profit also needs the saved mode to be a flip mode. */
  flipDesk: boolean;
}) {
  const [asked, setAsked] = useState(false);
  const { prefs } = usePreferences();
  const flip =
    flipDesk &&
    isFlipBuyerMode(
      readLocalBuyerIntent()?.buyerMode || prefs.buyerScope?.buyerMode,
    );
  const body = advisorRequestFor(deal, {
    homeState: effectiveHome(prefs)?.state,
  });
  const { data, error, isLoading } = useAdvisorRead(asked ? body : null);

  if (!body) return null;
  if (!asked)
    return (
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setAsked(true);
        }}
        className="min-h-11 text-xs font-bold text-[var(--blue)] hover:underline"
      >
        Check this deal
      </button>
    );
  if (isLoading)
    return (
      <span className="text-xs text-[var(--t4)]" aria-busy="true">
        Checking the market…
      </span>
    );
  if (error)
    return (
      <span className="text-xs text-[var(--t4)]">{NOT_ENOUGH_DATA_YET}</span>
    );
  const view = advisorView(data, { flipDesk: flip });
  if (view.state === "not_live")
    return (
      <span
        className="text-xs font-bold text-[var(--t3)]"
        data-advisor-state="not_live"
        title={view.reason}
      >
        {NOT_LIVE}
      </span>
    );
  if (view.state === "fair_only")
    return (
      <span
        className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--t2)]"
        data-advisor-state="fair_only"
        title={view.reason}
      >
        <span className="font-bold text-[var(--t3)]">{NOT_ENOUGH_DATA}</span>
        <span>
          Fair {money(view.fairValue.value)} · {view.fairValue.basisLabel}
        </span>
      </span>
    );
  if (view.state === "insufficient")
    return (
      <span
        className="text-xs font-bold text-[var(--t3)]"
        data-advisor-state="insufficient"
        title={view.reason}
      >
        {NOT_ENOUGH_DATA}
      </span>
    );
  return (
    <span
      className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-xs text-[var(--t2)]"
      data-advisor-state="ready"
      title={view.headline}
    >
      <VerdictPill verdict={view.verdict} word={view.word} size="sm" />
      {view.buyCeiling && (
        <strong className="text-[var(--t1)]">
          Buy at or under {money(view.buyCeiling.value)}
        </strong>
      )}
      <span>Fair {money(view.fairValue.value)}</span>
      {view.profit && <span>≈ {money(view.profit.value)} profit</span>}
      {view.confidenceNote && (
        <span className="text-[var(--t4)]">{view.confidenceNote}</span>
      )}
    </span>
  );
}
