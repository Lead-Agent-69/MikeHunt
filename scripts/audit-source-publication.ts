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
      hosts: { type: "string" },
      state: { type: "string" },
    },
  });
  if (!values["env-file"] || !values.cache)
    throw new Error(
      "Usage: npx tsx scripts/audit-source-publication.ts --env-file <worker-env> --cache <cache-json>",
    );
  const hosts = Array.from(
    new Set(
      (
        values.hosts ||
        "x2builders.com,billsmithauto.com,riverbendrebuildables.com,damage.com,dgautollc.com"
      )
        .split(",")
        .map((host) => host.trim().toLowerCase()),
    ),
  );
  if (
    hosts.length > 10 ||
    hosts.some(
      (host) =>
        host.length > 253 ||
        !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(host),
    )
  )
    throw new Error("Choose between one and ten plain source hostnames.");
  const state = values.state?.trim().toUpperCase();
  if (state !== undefined && !/^[A-Z]{2}$/.test(state))
    throw new Error("State must be a two-letter abbreviation.");
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
  ) as (CachedPublicationObservation & {
    data?: { location_state?: string };
  })[];
  const scopedObservations = state
    ? observations.filter((entry) => entry.data?.location_state === state)
    : observations;
  const sources = [];
  for (const host of hosts) {
    let query = db
      .from("deals")
      .select(
        "source,source_url,title,make,model,active,last_seen_at,auction_end_at,images,photoAudit:options->photoAudit,sourceAvailability:options->sourceAvailability",
      )
      .ilike("source_url", `%${host}/%`);
    if (state) query = query.eq("location_state", state);
    const { data, error } = await query
      .order("last_seen_at", { ascending: false })
      .limit(500)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error)
      throw new Error(
        `Publication audit failed for ${host} (${error.code || "query_failed"}).`,
      );
    const rows = (data || []).map(
      ({ photoAudit, sourceAvailability, ...row }) => ({
        ...row,
        options: {
          sourceAvailability:
            sourceAvailability &&
            typeof sourceAvailability === "object" &&
            !Array.isArray(sourceAvailability) &&
            typeof sourceAvailability.state === "string"
              ? { state: sourceAvailability.state }
              : undefined,
          photoAudit:
            photoAudit &&
            typeof photoAudit === "object" &&
            !Array.isArray(photoAudit) &&
            typeof photoAudit.state === "string"
              ? {
                  state: photoAudit.state,
                  placeholderUrls: Array.isArray(photoAudit.placeholderUrls)
                    ? photoAudit.placeholderUrls.filter(
                        (url): url is string => typeof url === "string",
                      )
                    : undefined,
                }
              : undefined,
        },
      }),
    );
    sources.push({
      ...sourcePublicationAudit(host, scopedObservations, rows),
      sampleLimit: 500,
      possiblyTruncated: rows.length === 500,
    });
  }
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        mode: "read_only",
        scope: { state: state || null, hosts, storedSamplePerHost: 500 },
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
