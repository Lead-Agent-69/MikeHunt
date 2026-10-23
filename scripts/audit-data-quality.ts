#!/usr/bin/env tsx
/**
 * Read-only production inventory audit.
 *
 * Counts are computed inside Postgres in one aggregate scan, then only compact
 * rollups cross the network. This keeps the audit useful on Supabase Free
 * without downloading every listing or repeating timeout-prone exact counts.
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT_HOST = "qupzqpezslsbobhugswp.supabase.co";
const DEAL_SOURCES = [
  "copart",
  "iaa",
  "adesa",
  "manheim",
  "facebook_marketplace",
  "craigslist",
  "ebay_motors",
  "autotrader",
  "cars_com",
  "gov_auction",
  "repo_network",
  "independent_dealer",
  "cargurus",
  "craigslist_dealer",
  "carvana",
  "truecar",
  "vroom",
  "offerup",
  "acv",
] as const;

type Severity = "critical" | "warning" | "info";

type QualityRollup = {
  checked_at: string;
  total_rows: number | string;
  active_rows: number | string;
  current_visible_rows: number | string;
  new_last_24h_rows: number | string;
  new_last_7d_rows: number | string;
  updated_last_24h_rows: number | string;
  newest_visible_at: string | null;
  retained_not_visible_rows: number | string;
  inactive_rows: number | string;
  unobserved_active_rows: number | string;
  future_observation_active_rows: number | string;
  stale_active_rows: number | string;
  missing_photos_active_rows: number | string;
  photos_unavailable_active_rows: number | string;
  source_removed_active_rows: number | string;
  ended_auction_active_rows: number | string;
  missing_required_active_rows: number | string;
  invalid_year_active_rows: number | string;
  invalid_price_active_rows: number | string;
  missing_price_active_rows: number | string;
  invalid_mileage_active_rows: number | string;
  missing_vin_active_rows: number | string;
  duplicate_vin_rows: number | string;
  missing_location_active_rows: number | string;
  missing_profit_score_active_rows: number | string;
  current_profit_modeled_rows: number | string;
  current_resale_evidence_rows: number | string;
  current_purchase_checks_complete_rows: number | string;
  current_strict_buy_candidates: number | string;
  current_geocoded_rows: number | string;
  current_city_rows: number | string;
  current_watch_candidate_rows: number | string;
  current_market_value_backed_rows: number | string;
  current_resale_estimate_backed_rows: number | string;
  current_deal_math_ready_rows: number | string;
  current_go_rows: number | string;
  current_hold_rows: number | string;
  current_pass_rows: number | string;
  current_insufficient_rows: number | string;
};

type SourceRollup = {
  source: string;
  active_rows: number | string;
  stored_active_rows: number | string;
  newest_seen: string | null;
};

type AuditIssue = {
  category: string;
  severity: Severity;
  count: number;
  percentage: number;
};

const count = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

const pct = (numerator: number, denominator: number) =>
  denominator > 0 ? Math.round((numerator / denominator) * 10_000) / 100 : 0;

function requiredEnv() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || new URL(url).hostname !== PROJECT_HOST)
    throw new Error("Refusing to audit a database other than MIKEHUNT.");
  if (!key) throw new Error("Worker database credential is not configured.");
  return { url, key };
}

function aggregateSources(rows: SourceRollup[]) {
  const sources = new Map<
    string,
    {
      source: string;
      visible: number;
      storedActive: number;
      newestSeen: string | null;
    }
  >();
  for (const row of rows) {
    const current = sources.get(row.source) || {
      source: row.source,
      visible: 0,
      storedActive: 0,
      newestSeen: null,
    };
    current.visible += count(row.active_rows);
    current.storedActive += count(row.stored_active_rows);
    if (
      row.newest_seen &&
      (!current.newestSeen || row.newest_seen > current.newestSeen)
    )
      current.newestSeen = row.newest_seen;
    sources.set(row.source, current);
  }
  return Array.from(sources.values()).sort(
    (a, b) => b.visible - a.visible || b.storedActive - a.storedActive,
  );
}

function buildIssues(row: QualityRollup): AuditIssue[] {
  const active = count(row.active_rows);
  const visible = count(row.current_visible_rows);
  const issues: AuditIssue[] = [];
  const add = (
    category: string,
    severity: Severity,
    value: unknown,
    denominator = active,
  ) => {
    const amount = count(value);
    if (amount > 0)
      issues.push({
        category,
        severity,
        count: amount,
        percentage: pct(amount, denominator),
      });
  };

  add(
    "Missing year, make or model",
    "critical",
    row.missing_required_active_rows,
  );
  add("Impossible model year", "critical", row.invalid_year_active_rows);
  add("Impossible advertised price", "warning", row.invalid_price_active_rows);
  add("No usable advertised price", "warning", row.missing_price_active_rows);
  add("Impossible mileage", "warning", row.invalid_mileage_active_rows);
  add("Missing VIN", "warning", row.missing_vin_active_rows);
  add(
    "Additional active rows sharing a valid VIN",
    "info",
    row.duplicate_vin_rows,
  );
  add("Missing photos", "info", row.missing_photos_active_rows);
  add("Photos audited unavailable", "info", row.photos_unavailable_active_rows);
  add(
    "Source-confirmed removed listings retained active",
    "critical",
    row.source_removed_active_rows,
  );
  add(
    "Known-ended auctions retained internally",
    "info",
    row.ended_auction_active_rows,
  );
  add("Stale active rows retained internally", "info", row.stale_active_rows);
  add(
    "Future observation timestamps",
    "critical",
    row.future_observation_active_rows,
  );
  add("Missing location state", "warning", row.missing_location_active_rows);
  add("Missing profit score", "warning", row.missing_profit_score_active_rows);

  const modeledWithoutChecks = Math.max(
    0,
    count(row.current_profit_modeled_rows) -
      count(row.current_purchase_checks_complete_rows),
  );
  add(
    "Current modeled-profit rows still missing completed purchase checks",
    "warning",
    modeledWithoutChecks,
    visible,
  );
  return issues;
}

async function main() {
  const { url, key } = requiredEnv();
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [qualityResult, sourceResult] = await Promise.all([
    db.rpc("inventory_quality_rollup_v1"),
    db.rpc("scrape_health_inventory_rollup_v2", {
      p_sources: [...DEAL_SOURCES],
    }),
  ]);
  if (qualityResult.error)
    throw new Error(
      `Quality rollup unavailable (${qualityResult.error.code || "query_failed"}). Apply the reviewed inventory-quality migration first.`,
    );
  if (sourceResult.error)
    throw new Error(
      `Source rollup unavailable (${sourceResult.error.code || "query_failed"}).`,
    );
  const quality = qualityResult.data?.[0] as QualityRollup | undefined;
  if (!quality) throw new Error("Quality rollup returned no row.");

  const sources = aggregateSources((sourceResult.data || []) as SourceRollup[]);
  const issues = buildIssues(quality);
  const active = count(quality.active_rows);
  const visible = count(quality.current_visible_rows);
  const report = {
    checkedAt: quality.checked_at,
    mode: "read_only_single_scan",
    inventory: {
      totalStored: count(quality.total_rows),
      activeStored: active,
      currentUserVisible: visible,
      retainedButNotUserVisible: count(quality.retained_not_visible_rows),
      currentVisibilityPct: pct(visible, active),
      defaultSurfaceWindowHours: 72,
      newLast24h: count(quality.new_last_24h_rows),
      newLast7d: count(quality.new_last_7d_rows),
      updatedLast24h: count(quality.updated_last_24h_rows),
      newestVisibleAt: quality.newest_visible_at,
    },
    profitability: {
      modeledCurrentRows: count(quality.current_profit_modeled_rows),
      resaleEvidenceRows: count(quality.current_resale_evidence_rows),
      purchaseChecksCompleteRows: count(
        quality.current_purchase_checks_complete_rows,
      ),
      strictBuyCandidates: count(quality.current_strict_buy_candidates),
      verdicts: {
        go: count(quality.current_go_rows),
        hold: count(quality.current_hold_rows),
        pass: count(quality.current_pass_rows),
        notEnoughData: count(quality.current_insufficient_rows),
      },
    },
    sources,
    issues,
    summary: {
      critical: issues.filter((issue) => issue.severity === "critical").length,
      warnings: issues.filter((issue) => issue.severity === "warning").length,
      info: issues.filter((issue) => issue.severity === "info").length,
    },
    notes: [
      "This is not verification of title, mechanical condition, or live source availability beyond recorded evidence.",
      "Modeled profit is not a buy recommendation unless the row also qualifies as a strict buy candidate.",
    ],
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Inventory quality audit");
    console.log(`Checked: ${report.checkedAt}`);
    console.log(
      `Stored ${report.inventory.totalStored.toLocaleString()} | active ${active.toLocaleString()} | user-visible ${visible.toLocaleString()} (${report.inventory.currentVisibilityPct}%)`,
    );
    console.log(
      `Retained but hidden from browse: ${report.inventory.retainedButNotUserVisible.toLocaleString()}`,
    );
    console.log(
      `Harvest activity: ${report.inventory.newLast24h.toLocaleString()} new in 24h | ${report.inventory.newLast7d.toLocaleString()} new in 7d | ${report.inventory.updatedLast24h.toLocaleString()} refreshed in 24h${report.inventory.newestVisibleAt ? ` | newest ${report.inventory.newestVisibleAt}` : ""}`,
    );
    console.log(
      `Profit evidence: modeled ${report.profitability.modeledCurrentRows.toLocaleString()} | resale evidence ${report.profitability.resaleEvidenceRows.toLocaleString()} | purchase checks complete ${report.profitability.purchaseChecksCompleteRows.toLocaleString()} | strict buy candidates ${report.profitability.strictBuyCandidates.toLocaleString()}`,
    );
    console.log("Current inventory by source:");
    for (const source of sources)
      console.log(
        `  ${source.source}: ${source.visible.toLocaleString()} visible / ${source.storedActive.toLocaleString()} active stored${source.newestSeen ? ` | newest ${source.newestSeen}` : ""}`,
      );
    console.log("Quality findings:");
    for (const issue of issues)
      console.log(
        `  ${issue.severity.toUpperCase()} ${issue.category}: ${issue.count.toLocaleString()} (${issue.percentage}%)`,
      );
    if (!issues.length)
      console.log("  No issues detected by the configured checks.");
    for (const note of report.notes) console.log(`Note: ${note}`);
  }

  if (report.summary.critical > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "Inventory audit failed.",
  );
  process.exitCode = 1;
});
