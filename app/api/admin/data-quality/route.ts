export const dynamic = "force-dynamic";

// GET /api/admin/data-quality — operator view of section I data quality:
//  - VIN conflicts (same VIN, different make or years 2+ apart), grouped by VIN with every source URL,
//    so an operator can see which listing is wrong. They are flagged, never merged.
//  - Duplicate links (exact VIN vs fuzzy) and sanity-flag counts on active rows.
// Ops-only (canManageOperations), service-role reads, nothing written.

import { NextRequest, NextResponse } from "next/server";
import { createServerComponentClient } from "@/lib/supabase";
import { canManageOperations } from "@/lib/auth/admin-operations";

const MAX_CONFLICT_ROWS = 500;

export async function GET(req: NextRequest) {
  if (!(await canManageOperations(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const sb = createServerComponentClient();
    const [conflicts, vinDups, fuzzyDups, flagged] = await Promise.all([
      sb
        .from("deals")
        .select(
          "id, vin, source, source_url, year, make, model, active, first_seen_at",
        )
        .contains("quality_flags", ["vin_conflict"])
        .order("vin", { ascending: true })
        .limit(MAX_CONFLICT_ROWS),
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .gte("duplicate_confidence", 1),
      sb
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("active", true)
        .not("duplicate_of_id", "is", null)
        .lt("duplicate_confidence", 1),
      sb
        .from("deals")
        .select("quality_flags")
        .eq("active", true)
        .not("quality_flags", "is", null)
        .limit(10_000),
    ]);
    const err =
      conflicts.error || vinDups.error || fuzzyDups.error || flagged.error;
    if (err) throw err;

    const byVin = new Map<string, any[]>();
    for (const r of conflicts.data || []) {
      const k = String(r.vin || "").toUpperCase();
      if (!byVin.has(k)) byVin.set(k, []);
      byVin.get(k)!.push(r);
    }
    const flagCounts: Record<string, number> = {};
    for (const r of flagged.data || [])
      for (const f of (r as { quality_flags: string[] | null }).quality_flags ||
        [])
        flagCounts[f] = (flagCounts[f] || 0) + 1;

    return NextResponse.json(
      {
        duplicates: {
          activeVinLinked: vinDups.count || 0,
          activeFuzzyLinked: fuzzyDups.count || 0,
        },
        flags: flagCounts,
        vinConflicts: Array.from(byVin.entries()).map(([vin, rows]) => ({
          vin,
          listings: rows.map((r) => ({
            id: r.id,
            source: r.source,
            sourceUrl: r.source_url,
            year: r.year,
            make: r.make,
            model: r.model,
            active: r.active,
            firstSeenAt: r.first_seen_at,
          })),
        })),
        truncated: (conflicts.data || []).length >= MAX_CONFLICT_ROWS,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[admin/data-quality]", error);
    return NextResponse.json(
      { error: "Failed to load data quality" },
      { status: 500 },
    );
  }
}
