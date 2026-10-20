import { readFile, stat } from "node:fs/promises";
import { parseArgs } from "node:util";
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  sourcePublicationAudit,
  type CachedPublicationObservation,
} from "../lib/scrapers/publication-audit";

async function main() {
  const { values } = parseArgs({
    options: {
      "env-file": { type: "string" },
      cache: { type: "string" },
    },
  });
  if (!values["env-file"] || !values.cache)
    throw new Error(
      "Usage: npx tsx scripts/audit-source-publication.ts --env-file <worker-env> --cache <cache-json>",
    );
  const env = config({ path: values["env-file"], override: true, quiet: true });
  if (env.error)
    throw new Error("Cannot load the requested worker environment.");
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || new URL(url).hostname !== "qupzqpezslsbobhugswp.supabase.co")
    throw new Error("Refusing to audit a database other than MIKEHUNT.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY)
    throw new Error("Worker database credential is not configured.");
  if ((await stat(values.cache)).size > 256 * 1024 * 1024)
    throw new Error("Cache exceeds the bounded audit size.");
  const cache = JSON.parse(await readFile(values.cache, "utf8"));
  if (cache.version !== 1 || !cache.entries || Array.isArray(cache.entries))
    throw new Error("Invalid collector cache.");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const observations = Object.values(
    cache.entries,
  ) as CachedPublicationObservation[];
  const sources = [];
  for (const host of [
    "x2builders.com",
    "billsmithauto.com",
    "riverbendrebuildables.com",
    "damage.com",
    "dgautollc.com",
  ]) {
    const { data, error } = await db
      .from("deals")
      .select(
        "source,source_url,title,make,model,active,last_seen_at,images,photoAudit:options->photoAudit",
      )
      .eq("source", "independent_dealer")
      .ilike("source_url", `%${host}/%`)
      .order("last_seen_at", { ascending: false })
      .limit(500)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error)
      throw new Error(
        `Publication audit failed for ${host} (${error.code || "query_failed"}).`,
      );
    const rows = (data || []).map(({ photoAudit, ...row }) => ({
      ...row,
      options: {
        photoAudit:
          photoAudit &&
          typeof photoAudit === "object" &&
          !Array.isArray(photoAudit) &&
          typeof photoAudit.state === "string"
            ? { state: photoAudit.state }
            : undefined,
      },
    }));
    sources.push({
      ...sourcePublicationAudit(host, observations, rows),
      sampleLimit: 500,
      possiblyTruncated: rows.length === 500,
    });
  }
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "read_only",
        personalizedVisibilityVerified: false,
        sources,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Publication audit failed.",
  );
  process.exitCode = 1;
});
