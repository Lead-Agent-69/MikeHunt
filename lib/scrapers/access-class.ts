// Client-safe access-class type and wording, shared by the registry (source-access.ts) and /status.

/**
 * - `api`: official or partner API used under its published terms.
 * - `allowed`: public pages; terms do not ban automated access and robots.txt allows our paths.
 * - `restricted`: terms ban robots/scrapers/data mining, or need a licence/dealer account.
 * - `operator_override`: **NOT permission.** The operator chose to run this source despite a terms
 *   ban, a robots.txt disallow or a policy block. It records a business decision that carries legal
 *   risk; it is not a clearance.
 */
export type AccessClass =
  | "api"
  | "allowed"
  | "restricted"
  | "operator_override";

export const OPERATOR_OVERRIDE_NOTE =
  "operator_override is not permission: the operator chose to run this source despite a terms ban, robots.txt disallow or policy block, and it carries legal risk.";
