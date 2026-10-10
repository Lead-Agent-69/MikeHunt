"use client";

import React, { useState } from "react";
import {
  advisorRequestFor,
  advisorView,
  NOT_ENOUGH_DATA,
} from "@/lib/intelligence/advisor-view";
import { useAdvisorRead } from "@/hooks/useAdvisorRead";
import { usePreferences } from "@/hooks/usePreferences";
import { readLocalBuyerIntent } from "@/hooks/useBuyerIntent";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

// Compact advisor line for DealCard. It's tap-to-check: /api/check-listing is rate limited
// (10/min), so a list of cards never fires one request each. After the tap it shows the verb,
// Buy ≤ and fair value (profit too on flip desks), or "Not enough data". It never shows a guess.

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

const COLOR = {
  buy: "var(--green)",
  wait: "var(--amber-d)",
  pass: "var(--red)",
};

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
  const body = advisorRequestFor(deal);
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
        Get the MikeHunt read
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
      <span className="text-xs text-[var(--t4)]">
        Read unavailable right now
      </span>
    );
  const view = advisorView(data, { flipDesk: flip });
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
      className="flex flex-wrap items-center gap-x-2 text-xs text-[var(--t2)]"
      data-advisor-state="ready"
      title={view.headline}
    >
      <strong style={{ color: COLOR[view.verdict] }}>{view.word}</strong>
      {view.buyCeiling && <span>Buy ≤ {money(view.buyCeiling.value)}</span>}
      <span>Fair {money(view.fairValue.value)}</span>
      {view.profit && <span>≈ {money(view.profit.value)} profit</span>}
    </span>
  );
}
