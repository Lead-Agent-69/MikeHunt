// Maps the saved onboarding buyerMode onto the deal-page desk.
// Personal and DIY are not a dealer command desk. Missing mode stays personal.

export type SavedBuyerMode = "personal" | "diy" | "reseller" | "dealer";
export type DealDeskUserType = "dealer" | "private" | "parts";

export function normalizeSavedBuyerMode(
  value: unknown,
): SavedBuyerMode | undefined {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw === "personal" || raw === "personal-buyer") return "personal";
  if (raw === "diy" || raw === "enthusiast") return "diy";
  if (raw === "reseller" || raw === "independent-reseller") return "reseller";
  if (raw === "dealer" || raw === "team" || raw === "dealer-team")
    return "dealer";
  return undefined;
}

export function userTypeFromSavedBuyerMode(value: unknown): DealDeskUserType {
  const mode = normalizeSavedBuyerMode(value);
  if (mode === "reseller" || mode === "dealer") return "dealer";
  return "private";
}

export function isPersonalDeskMode(value: unknown): boolean {
  const mode = normalizeSavedBuyerMode(value);
  return mode !== "reseller" && mode !== "dealer";
}
