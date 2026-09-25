#!/usr/bin/env tsx
/**
 * Data Quality Audit Script (Read-Only)
 *
 * Checks data quality across the deals table and reports issues.
 * Does NOT modify any data - pure audit/reporting.
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

interface AuditReport {
  timestamp: Date;
  totalDeals: number;
  activeDeals: number;
  issues: {
    category: string;
    severity: "critical" | "warning" | "info";
    count: number;
    percentage: number;
    examples: any[];
  }[];
  summary: {
    critical: number;
    warnings: number;
    info: number;
  };
}

async function auditDataQuality(): Promise<AuditReport> {
  console.log("🔍 Starting data quality audit...\n");

  const report: AuditReport = {
    timestamp: new Date(),
    totalDeals: 0,
    activeDeals: 0,
    issues: [],
    summary: { critical: 0, warnings: 0, info: 0 },
  };

  // Get total counts
  const { count: totalCount } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true });

  const { count: activeCount } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true);

  report.totalDeals = totalCount || 0;
  report.activeDeals = activeCount || 0;

  console.log(`📊 Total deals: ${report.totalDeals}`);
  console.log(`✅ Active deals: ${report.activeDeals}\n`);

  // Check 1: Missing required fields
  await checkMissingFields(report);

  // Check 2: Invalid years
  await checkInvalidYears(report);

  // Check 3: Invalid prices
  await checkInvalidPrices(report);

  // Check 4: Invalid mileage
  await checkInvalidMileage(report);

  // Check 5: Missing VINs
  await checkMissingVins(report);

  // Check 6: Duplicate VINs
  await checkDuplicateVins(report);

  // Check 7: Missing images
  await checkMissingImages(report);

  // Check 8: Missing location data
  await checkMissingLocation(report);

  // Check 9: Stale deals (not updated)
  await checkStaleDeals(report);

  // Check 10: Scoring issues
  await checkScoringIssues(report);

  // Calculate summary
  report.issues.forEach((issue) => {
    report.summary[
      issue.severity === "critical"
        ? "critical"
        : issue.severity === "warning"
          ? "warnings"
          : "info"
    ]++;
  });

  return report;
}

async function checkMissingFields(report: AuditReport) {
  const { data: missing } = await supabase
    .from("deals")
    .select("id, source, title, year, make, model")
    .eq("active", true)
    .or("year.is.null,make.is.null,model.is.null")
    .limit(5);

  if (missing && missing.length > 0) {
    report.issues.push({
      category: "Missing Required Fields",
      severity: "critical",
      count: missing.length,
      percentage: (missing.length / report.activeDeals) * 100,
      examples: missing,
    });
  }
}

async function checkInvalidYears(report: AuditReport) {
  const currentYear = new Date().getFullYear();
  const { data: invalid } = await supabase
    .from("deals")
    .select("id, source, title, year")
    .eq("active", true)
    .or(`year.lt.1990,year.gt.${currentYear + 2}`)
    .limit(5);

  if (invalid && invalid.length > 0) {
    report.issues.push({
      category: "Invalid Years",
      severity: "critical",
      count: invalid.length,
      percentage: (invalid.length / report.activeDeals) * 100,
      examples: invalid,
    });
  }
}

async function checkInvalidPrices(report: AuditReport) {
  const { data: invalid } = await supabase
    .from("deals")
    .select("id, source, title, ask_price")
    .eq("active", true)
    .or("ask_price.lt.100,ask_price.gt.500000")
    .limit(5);

  if (invalid && invalid.length > 0) {
    report.issues.push({
      category: "Invalid Prices",
      severity: "warning",
      count: invalid.length,
      percentage: (invalid.length / report.activeDeals) * 100,
      examples: invalid,
    });
  }
}

async function checkInvalidMileage(report: AuditReport) {
  const { data: invalid } = await supabase
    .from("deals")
    .select("id, source, title, mileage")
    .eq("active", true)
    .not("mileage", "is", null)
    .or("mileage.lt.100,mileage.gt.500000")
    .limit(5);

  if (invalid && invalid.length > 0) {
    report.issues.push({
      category: "Invalid Mileage",
      severity: "warning",
      count: invalid.length,
      percentage: (invalid.length / report.activeDeals) * 100,
      examples: invalid,
    });
  }
}

async function checkMissingVins(report: AuditReport) {
  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .is("vin", null);

  const percentage = ((count || 0) / report.activeDeals) * 100;

  if (percentage > 50) {
    report.issues.push({
      category: "Missing VINs",
      severity: "info",
      count: count || 0,
      percentage,
      examples: [],
    });
  }
}

async function checkDuplicateVins(report: AuditReport) {
  const { data: duplicates } = await supabase.rpc("find_duplicate_vins", {
    limit_count: 5,
  });

  if (duplicates && duplicates.length > 0) {
    report.issues.push({
      category: "Duplicate VINs",
      severity: "warning",
      count: duplicates.length,
      percentage: (duplicates.length / report.activeDeals) * 100,
      examples: duplicates,
    });
  }
}

async function checkMissingImages(report: AuditReport) {
  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .or("images.is.null,images.eq.{}");

  const percentage = ((count || 0) / report.activeDeals) * 100;

  if (percentage > 30) {
    report.issues.push({
      category: "Missing Images",
      severity: "info",
      count: count || 0,
      percentage,
      examples: [],
    });
  }
}

async function checkMissingLocation(report: AuditReport) {
  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .is("location_state", null);

  if (count && count > 0) {
    report.issues.push({
      category: "Missing Location State",
      severity: "warning",
      count,
      percentage: (count / report.activeDeals) * 100,
      examples: [],
    });
  }
}

async function checkStaleDeals(report: AuditReport) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .lt("last_seen_at", thirtyDaysAgo.toISOString());

  if (count && count > 0) {
    report.issues.push({
      category: "Stale Deals (30+ days)",
      severity: "info",
      count,
      percentage: (count / report.activeDeals) * 100,
      examples: [],
    });
  }
}

async function checkScoringIssues(report: AuditReport) {
  const { count } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .eq("active", true)
    .is("profit_score", null);

  if (count && count > 0) {
    report.issues.push({
      category: "Missing Profit Score",
      severity: "warning",
      count,
      percentage: (count / report.activeDeals) * 100,
      examples: [],
    });
  }
}

function printReport(report: AuditReport) {
  console.log("\n📋 AUDIT REPORT");
  console.log("═".repeat(60));
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Total Deals: ${report.totalDeals}`);
  console.log(`Active Deals: ${report.activeDeals}\n`);

  if (report.issues.length === 0) {
    console.log("✅ No data quality issues found!\n");
    return;
  }

  // Critical issues
  const critical = report.issues.filter((i) => i.severity === "critical");
  if (critical.length > 0) {
    console.log("🔴 CRITICAL ISSUES:");
    critical.forEach((issue) => {
      console.log(
        `  • ${issue.category}: ${issue.count} (${issue.percentage.toFixed(1)}%)`,
      );
      if (issue.examples.length > 0) {
        console.log(
          `    Examples: ${issue.examples.map((e) => e.id).join(", ")}`,
        );
      }
    });
    console.log("");
  }

  // Warnings
  const warnings = report.issues.filter((i) => i.severity === "warning");
  if (warnings.length > 0) {
    console.log("⚠️  WARNINGS:");
    warnings.forEach((issue) => {
      console.log(
        `  • ${issue.category}: ${issue.count} (${issue.percentage.toFixed(1)}%)`,
      );
    });
    console.log("");
  }

  // Info
  const info = report.issues.filter((i) => i.severity === "info");
  if (info.length > 0) {
    console.log("ℹ️  INFO:");
    info.forEach((issue) => {
      console.log(
        `  • ${issue.category}: ${issue.count} (${issue.percentage.toFixed(1)}%)`,
      );
    });
    console.log("");
  }

  // Summary
  console.log("📊 SUMMARY:");
  console.log(`  Critical: ${report.summary.critical}`);
  console.log(`  Warnings: ${report.summary.warnings}`);
  console.log(`  Info: ${report.summary.info}`);
  console.log("");
}

// Run audit
auditDataQuality()
  .then((report) => {
    printReport(report);
    process.exit(report.summary.critical > 0 ? 1 : 0);
  })
  .catch((error) => {
    console.error("❌ Audit failed:", error);
    process.exit(1);
  });
