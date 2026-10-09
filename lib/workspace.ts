export type WorkspaceMode = "focused" | "expanded";

export function workspaceIsExpanded(buyerMode: unknown, mode?: unknown) {
  if (buyerMode === "dealer") return true;
  return mode === "expanded";
}

export const FOCUSED_TOOLS = new Set([
  "/discover",
  "/scan",
  "/dealer-network",
  "/map",
  "/saved",
  "/searches",
  "/alerts",
  "/compare",
  "/deal-check",
  "/fleet",
  "/move",
  "/parts",
  "/recon",
  "/lane",
  "/insights",
  "/settings",
  "/upgrade",
  "/changelog",
]);
