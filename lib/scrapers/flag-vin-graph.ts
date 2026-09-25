// Fold the VIN-graph into the verdict, continuously. For every VIN seen 2+ times, compute its
// cross-market history; write flags onto each active deal; and where the live listing MISREPRESENTS the
// car (claims clean but our records show branded/washed/rolled-back), demote it out of the GO list +
// warn — so a dealer can't overpay clean-car money for a hidden-salvage car. Best-effort; safe to run
// every scrape cycle. Reused by scripts/flag-vin-graph.ts (manual) and scrape-ci (automatic).
import type { SupabaseClient } from "@supabase/supabase-js";
import { sightingsToHistory, graphRisk } from "@/lib/vehicle/vin-history";

export async function flagVinGraph(
  sb: SupabaseClient,
  opts: { maxPages?: number } = {},
): Promise<{ vins: number; flagged: number; demoted: number }> {
  const byVin = new Map<string, any[]>();
  const maxPages = opts.maxPages ?? 60;
  for (let page = 0; page < maxPages; page++) {
    const { data } = await sb
      .from("deals")
      .select(
        "id, vin, source, condition, damage_type, mileage, created_at, location_state, active, deal_verdict, deal_analysis",
      )
      .not("vin", "is", null)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (!data || !data.length) break;
    for (const r of data) {
      const v = String(r.vin).toUpperCase();
      if (v.length !== 17) continue;
      let arr = byVin.get(v);
      if (!arr) byVin.set(v, (arr = []));
      arr.push(r);
    }
    if (data.length < 1000) break;
  }

  let flagged = 0,
    demoted = 0;
  for (const rows of Array.from(byVin.values())) {
    if (rows.length < 2) continue;
    const hist = sightingsToHistory(rows);
    if (!hist) continue;
    const flags = hist.titleBrands;
    for (const d of rows) {
      if (!d.active) continue;
      const risk = graphRisk(d.condition, flags);
      const analysis = d.deal_analysis || {};
      const warnings: string[] = Array.isArray(analysis.warnings)
        ? analysis.warnings.slice()
        : [];
      if (risk.warning && !warnings.includes(risk.warning))
        warnings.push(risk.warning);
      const update: any = {
        deal_analysis: {
          ...analysis,
          vinFlags: flags,
          vinFlagSeverity: risk.severity,
          warnings,
        },
      };
      if (
        risk.misrepresented &&
        (d.deal_verdict === "go" || d.deal_verdict === "hold")
      ) {
        update.deal_verdict = "pass";
        update.is_arbitrage_opportunity = false;
        demoted++;
      }
      const { error } = await sb.from("deals").update(update).eq("id", d.id);
      if (!error) flagged++;
    }
  }
  return { vins: byVin.size, flagged, demoted };
}
