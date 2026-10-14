// Full rescore of all active deals (valuation + verdict + max-bid + score), applying the current
// analyzeDeal model — including the new price-plausibility gate. Mirrors app/api/admin/rescore but
// runs directly via the service role (no server / no INGEST_SECRET needed). Idempotent; re-runnable.
import { createClient } from "@supabase/supabase-js";
import { analyzeDeal } from "../lib/scoring/deal-analyzer";
import { loadMarketIndex } from "../lib/scoring/market-value";
import { extractTrim } from "../lib/scrapers/tools/deal-normalizer";
import { rescoreUpdate } from "../lib/scoring/rescore-update";
import { config } from "dotenv";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  await loadMarketIndex(sb);
  const pageSize = 1000; // PostgREST hard cap
  let page = 0,
    scanned = 0,
    updated = 0,
    goToPass = 0,
    failed = 0;
  const verdicts: Record<string, number> = {};
  while (true) {
    const { data: deals, error } = await sb
      .from("deals")
      .select("*")
      .eq("active", true)
      .order("id", { ascending: true }) // stable pages while rows are being updated
      .range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw error;
    if (!deals || deals.length === 0) break;

    const processDeal = async (row: any) => {
      try {
        if (!row.trim) {
          const t = extractTrim(row.title, row.make, row.model);
          if (t) row.trim = t;
        }
        const a = analyzeDeal(row);
        const patch = rescoreUpdate(row, a);
        const { data: written, error: upErr } = await sb
          .from("deals")
          .update({
            trim: row.trim ?? null,
            ...patch,
          })
          .eq("id", row.id)
          .eq("active", true)
          .eq("updated_at", row.updated_at)
          .select("id");
        if (upErr || written?.length !== 1)
          throw new Error("Score write not confirmed");
        updated++;
        if (row.deal_verdict === "go" && patch.deal_verdict !== "go")
          goToPass++;
        verdicts[patch.deal_verdict] = (verdicts[patch.deal_verdict] || 0) + 1;
      } catch {
        failed++;
      }
    };

    // Concurrently process updates in sub-batches of 50
    const concurrencyLimit = 50;
    for (let i = 0; i < deals.length; i += concurrencyLimit) {
      const subBatch = deals.slice(i, i + concurrencyLimit);
      await Promise.all(subBatch.map((d) => processDeal(d)));
    }

    scanned += deals.length;
    console.log(
      `page ${page}: scanned ${scanned}, updated ${updated}, go→pass ${goToPass}`,
    );
    if (deals.length < pageSize) break;
    page++;
  }
  console.log(
    `DONE: scanned ${scanned}, updated ${updated}, failed ${failed}, demoted go→pass ${goToPass}`,
  );
  console.log("verdicts:", JSON.stringify(verdicts));
  return failed;
}
main()
  .then((failed) => process.exit(failed ? 1 : 0))
  .catch(() => {
    console.error("Rescore aborted; completion was not confirmed.");
    process.exit(1);
  });
