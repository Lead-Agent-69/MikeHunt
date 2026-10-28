/** Buying tools are a preference, not an admin permission or dealer identity. */
export const BUYING_WORKSPACE_MODE = "personal" as const;

const MODES = new Set(["personal", "diy", "parts", "reseller", "dealer"]);

export function buyingWorkspaceScope<
  T extends { buyerMode?: unknown; legacyBuyerMode?: unknown },
>(scope: T) {
  const selected =
    typeof scope.buyerMode === "string" && MODES.has(scope.buyerMode)
      ? scope.buyerMode
      : BUYING_WORKSPACE_MODE;
  return {
    ...scope,
    legacyBuyerMode:
      typeof scope.legacyBuyerMode === "string"
        ? scope.legacyBuyerMode
        : undefined,
    buyerMode: selected as "personal" | "diy" | "parts" | "reseller" | "dealer",
  };
}
