import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import {
  ACCESS_GRANTS,
  ACCESS_POLICY_REVISION,
  validGrant,
} from "../lib/scrapers/access-policy";

async function main() {
  if (ACCESS_GRANTS.some((g) => !validGrant(g)))
    throw new Error(
      "Invalid/expired source-access evidence. Nothing synchronized.",
    );
  const keys = ACCESS_GRANTS.map((g) => `${g.sourceId}|${g.host}|${g.route}`);
  if (new Set(keys).size !== keys.length)
    throw new Error("Duplicate access grants");
  console.log(
    `${ACCESS_GRANTS.length} reviewed grants; revision ${ACCESS_POLICY_REVISION}`,
  );
  if (!process.argv.includes("--apply")) {
    console.log(
      "Validation only. --apply synchronizes evidence to the migrated database.",
    );
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase credentials required");
  const client = createClient(url, key, { auth: { persistSession: false } });
  // Fail closed during synchronization. A failed sync leaves everything held, never over-authorized.
  const revoked = await client
    .from("source_access_grants")
    .update({ can_collect: false, can_display: false, can_derive: false })
    .neq("source_id", "");
  if (revoked.error) throw new Error("Could not revoke old access rules");
  if (ACCESS_GRANTS.length) {
    const res = await client.from("source_access_grants").upsert(
      ACCESS_GRANTS.map((g) => ({
        source_id: g.sourceId,
        host: g.host,
        route: g.route,
        evidence: g.evidence,
        reviewed_at: g.reviewedAt,
        expires_at: g.expiresAt,
        can_collect: g.collect,
        can_display: g.display,
        can_derive: g.derive,
        policy_revision: ACCESS_POLICY_REVISION,
      })),
      { onConflict: "source_id,host,route" },
    );
    if (res.error)
      throw new Error("Could not synchronize reviewed source rules");
  }
  // Do not reactivate legacy listings: re-observation must establish availability and provenance.
  console.log(
    "Rules synchronized. Legacy inventory remains held until re-observed.",
  );
}
main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Access sync failed");
  process.exitCode = 1;
});
