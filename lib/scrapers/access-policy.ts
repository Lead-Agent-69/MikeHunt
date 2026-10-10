import reviewedGrants from "./access-grants.json";

export const ACCESS_POLICY_REVISION = "2026-10-integrity-v1";
export type AccessRoute = "api" | "feed" | "website";
export interface AccessGrant {
  sourceId: string;
  host: string;
  route: AccessRoute;
  evidence: string;
  reviewedAt: string;
  expiresAt: string;
  collect: boolean;
  display: boolean;
  derive: boolean;
}

export const ACCESS_GRANTS = reviewedGrants as AccessGrant[];
export function normalizedHost(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (
      !/^https?:$/.test(parsed.protocol) ||
      parsed.username ||
      parsed.password
    )
      return null;
    return parsed.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function validGrant(grant: AccessGrant, now = Date.now()): boolean {
  const reviewed = Date.parse(grant.reviewedAt);
  const expiry = Date.parse(grant.expiresAt);
  return Boolean(
    grant.sourceId?.trim() &&
    grant.host &&
    grant.host === grant.host.toLowerCase() &&
    !/[\s/:*]/.test(grant.host) &&
    ["api", "feed", "website"].includes(grant.route) &&
    /^https:\/\//.test(grant.evidence || "") &&
    normalizedHost(grant.evidence) &&
    Number.isFinite(reviewed) &&
    reviewed <= now &&
    expiry > now,
  );
}

/** An explicit operator source list is selection, never permission. Exact hosts avoid sibling-site grants. */
export function accessDecision(
  sourceId: string | undefined,
  url?: string,
  use: "collect" | "display" | "derive" = "collect",
  grants: readonly AccessGrant[] = ACCESS_GRANTS,
  now = Date.now(),
  route?: AccessRoute,
) {
  const host = url ? normalizedHost(url) : null;
  const grant = grants.find(
    (g) =>
      validGrant(g, now) &&
      g[use] === true &&
      (!sourceId || g.sourceId === sourceId) &&
      (!url || g.host === host) &&
      (!route || g.route === route),
  );
  return {
    allowed: Boolean(grant),
    status: grant ? ("approved" as const) : ("held" as const),
    revision: ACCESS_POLICY_REVISION,
    reason: grant
      ? null
      : "Documented source authorization is missing, expired, or does not cover this use/host.",
    grant,
  };
}

export class SourceAccessError extends Error {
  readonly code = "permission_required";
  constructor(sourceId?: string) {
    super(`Source permission required${sourceId ? `: ${sourceId}` : ""}`);
    this.name = "SourceAccessError";
  }
}
export function assertSourceAccess(
  sourceId?: string,
  url?: string,
  route: AccessRoute = "website",
) {
  if (
    !accessDecision(sourceId, url, "collect", ACCESS_GRANTS, Date.now(), route)
      .allowed
  )
    throw new SourceAccessError(sourceId);
}

export function listingEligible(
  row: { source?: string; source_url?: string },
  use: "display" | "derive" = "display",
) {
  // Aggregated rows retain a generic DB enum; the original host identifies the grant.
  return Boolean(
    row.source_url && accessDecision(undefined, row.source_url, use).allowed,
  );
}
