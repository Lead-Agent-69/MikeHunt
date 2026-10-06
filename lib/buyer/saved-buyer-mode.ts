// Maps the saved onboarding buyerMode onto the deal-page desk.
// Personal and DIY are not a dealer command desk. Parts gets the parts desk.
// Missing mode stays personal / private.

export type SavedBuyerMode =
  | "personal"
  | "diy"
  | "parts"
  | "reseller"
  | "dealer";
export type DealDeskUserType = "dealer" | "private" | "parts";

export function normalizeSavedBuyerMode(
  value: unknown,
): SavedBuyerMode | undefined {
  const raw = String(value || "")
    .toLowerCase()
    .trim();
  if (raw === "personal" || raw === "personal-buyer") return "personal";
  if (raw === "diy" || raw === "enthusiast") return "diy";
  if (raw === "parts" || raw === "parts-buyer" || raw === "teardown")
    return "parts";
  if (raw === "reseller" || raw === "independent-reseller") return "reseller";
  if (raw === "dealer" || raw === "team" || raw === "dealer-team")
    return "dealer";
  return undefined;
}

export function userTypeFromSavedBuyerMode(value: unknown): DealDeskUserType {
  const mode = normalizeSavedBuyerMode(value);
  if (mode === "parts") return "parts";
  if (mode === "reseller" || mode === "dealer") return "dealer";
  return "private";
}

export function isPersonalDeskMode(value: unknown): boolean {
  const mode = normalizeSavedBuyerMode(value);
  return mode !== "reseller" && mode !== "dealer";
}
