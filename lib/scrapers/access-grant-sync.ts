import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACCESS_POLICY_REVISION,
  validGrant,
  type AccessGrant,
} from "./access-policy";

type GrantRow = {
  source_id: string;
  host: string;
  route: string;
  evidence: string;
  reviewed_at: string;
  expires_at: string;
  can_collect: boolean;
  can_display: boolean;
  can_derive: boolean;
  policy_revision: string;
};
const keyOf = (row: Pick<GrantRow, "source_id" | "host" | "route">) =>
  JSON.stringify([row.source_id, row.host, row.route]);
const rowOf = (grant: AccessGrant): GrantRow => ({
  source_id: grant.sourceId,
  host: grant.host,
  route: grant.route,
  evidence: grant.evidence,
  reviewed_at: grant.reviewedAt,
  expires_at: grant.expiresAt,
  can_collect: grant.collect,
  can_display: grant.display,
  can_derive: grant.derive,
  policy_revision: ACCESS_POLICY_REVISION,
});

export function planAccessGrantSync(
  existing: GrantRow[],
  grants: readonly AccessGrant[],
  now = Date.now(),
) {
  if (grants.some((g) => !validGrant(g, now)))
    throw new Error("Invalid or expired source-access evidence");
  const desired = new Map(
    grants.map((g) => {
      const row = rowOf(g);
      return [keyOf(row), row] as const;
    }),
  );
  if (desired.size !== grants.length)
    throw new Error("Duplicate source-access grants");
  const current = new Map(existing.map((row) => [keyOf(row), row] as const));
  if (current.size !== existing.length)
    throw new Error("Ambiguous existing source-access grants");
  const same = (a: GrantRow, b: GrantRow) =>
    a.evidence === b.evidence &&
    Date.parse(a.reviewed_at) === Date.parse(b.reviewed_at) &&
    Date.parse(a.expires_at) === Date.parse(b.expires_at) &&
    a.can_collect === b.can_collect &&
    a.can_display === b.can_display &&
    a.can_derive === b.can_derive &&
    a.policy_revision === b.policy_revision;
  const revoke = existing.filter((row) => {
    const replacement = desired.get(keyOf(row));
    return (
      (row.can_collect || row.can_display || row.can_derive) &&
      (!replacement || !same(row, replacement))
    );
  });
  const upsert = Array.from(desired.values()).filter(
    (row) => !current.has(keyOf(row)) || !same(current.get(keyOf(row))!, row),
  );
  return { revoke, upsert, unchanged: desired.size - upsert.length };
}

/** Revoke changed rights first, but never interrupt identical, already-approved grants. */
export async function synchronizeAccessGrants(
  client: SupabaseClient,
  grants: readonly AccessGrant[],
) {
  // Read the complete bounded policy table before making any changes.
  const { data, error, count } = await client
    .from("source_access_grants")
    .select(
      "source_id,host,route,evidence,reviewed_at,expires_at,can_collect,can_display,can_derive,policy_revision",
      { count: "exact" },
    )
    .range(0, 1999);
  if (error || !Array.isArray(data) || count !== data.length)
    throw new Error(
      "Cannot read complete source-access policy; nothing synchronized",
    );
  const plan = planAccessGrantSync(data as GrantRow[], grants);
  for (const row of plan.revoke) {
    const result = await client
      .from("source_access_grants")
      .update({ can_collect: false, can_display: false, can_derive: false })
      .eq("source_id", row.source_id)
      .eq("host", row.host)
      .eq("route", row.route);
    if (result.error)
      throw new Error(
        "Could not revoke changed access rules; replacement not attempted",
      );
  }
  if (plan.upsert.length) {
    const result = await client
      .from("source_access_grants")
      .upsert(plan.upsert, { onConflict: "source_id,host,route" });
    if (result.error)
      throw new Error(
        "Could not synchronize reviewed rules; changed rights remain revoked",
      );
  }
  return {
    revoked: plan.revoke.length,
    updated: plan.upsert.length,
    unchanged: plan.unchanged,
  };
}
