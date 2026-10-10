// Read-time desk gate for /api/saved-cars. Snapshots are stored with full flip economics and seller
// contact (taken at save time, possibly on a flip desk). Redacting on READ means a user who later
// switches to a personal / parts / DIY desk stops seeing them, and switching back restores them.
// Market value (sellEstimate, marketValue, askingPrice) stays: a personal buyer still needs it.

const ROW_FLIP_ONLY = [
  "profit_at_save",
  "true_net_profit",
  "max_bid",
  "profit_score",
  "repair_estimate",
  "transport_cost",
  "estimated_repair_cost",
  "estimated_transport_cost",
  "seller_phone",
  "seller_email",
  "seller_contact_url",
  "contact",
] as const;

const SNAPSHOT_FLIP_ONLY = [
  // seller contact
  "sellerPhone",
  "sellerEmail",
  "sellerContactUrl",
  "seller_phone",
  "seller_email",
  "seller_contact_url",
  "contact",
  // flip economics
  "estimatedProfit",
  "trueNetProfit",
  "true_net_profit",
  "profitEstimate",
  "profit_estimate",
  "recommendedMaxBid",
  "recommended_max_bid",
  "maxBid",
  "max_bid",
  "profitScore",
  "profit_score",
  "repairEstimate",
  "repair_estimate",
  "transportEstimate",
  "transport_cost",
  "estimated_repair_cost",
  "estimated_transport_cost",
  "dealVerdict",
  "deal_verdict",
] as const;

// Trust-explanation lines that narrate flip economics ("$2,100 estimated spread", fee math).
const ECONOMICS_LINE = /spread|profit|\bROI\b|max bid|resale and fee math/i;

function safeTrust(trust: unknown): unknown {
  if (!trust || typeof trust !== "object") return trust;
  const t = { ...(trust as Record<string, unknown>) };
  const clean = (v: unknown) =>
    Array.isArray(v)
      ? v.filter((x) => typeof x !== "string" || !ECONOMICS_LINE.test(x))
      : v;
  t.reasons = clean(t.reasons);
  t.nextChecks = clean(t.nextChecks);
  if (typeof t.summary === "string" && ECONOMICS_LINE.test(t.summary)) {
    const reasons = Array.isArray(t.reasons) ? (t.reasons as string[]) : [];
    t.summary = reasons.length
      ? reasons.slice(0, 3).join(" · ")
      : "Thin proof: verify original listing details before acting.";
  }
  return t;
}

/** Copy of a saved_cars row for a non-flip desk. Never mutates the input. */
export function redactSavedCarForNonFlipDesk<T extends Record<string, any>>(
  row: T,
): Record<string, any> {
  const out: Record<string, any> = { ...row };
  for (const k of ROW_FLIP_ONLY) delete out[k];
  if (row?.snapshot && typeof row.snapshot === "object") {
    const snap: Record<string, any> = { ...row.snapshot };
    for (const k of SNAPSHOT_FLIP_ONLY) delete snap[k];
    if ("trustExplanation" in snap)
      snap.trustExplanation = safeTrust(snap.trustExplanation);
    out.snapshot = snap;
  }
  out.deskAccess = "personal";
  return out;
}

export function savedCarsForDesk<T extends Record<string, any>>(
  rows: T[],
  flipDesk: boolean,
): Array<T | Record<string, any>> {
  return flipDesk ? rows : rows.map((r) => redactSavedCarForNonFlipDesk(r));
}
