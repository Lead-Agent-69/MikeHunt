/** Buying tools are a preference, not an admin permission or dealer identity. */
export const BUYING_WORKSPACE_MODE = "reseller" as const;

export function buyingWorkspaceScope<
  T extends { buyerMode?: unknown; legacyBuyerMode?: unknown },
>(scope: T) {
  const previous = scope.legacyBuyerMode ?? scope.buyerMode;
  return {
    ...scope,
    ...(typeof previous === "string" &&
    ["personal", "diy", "parts", "dealer"].includes(previous)
      ? { legacyBuyerMode: previous }
      : {}),
    buyerMode: BUYING_WORKSPACE_MODE,
  };
}
