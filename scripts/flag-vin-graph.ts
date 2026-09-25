// Manual runner for the VIN-graph → verdict pass. The core lives in lib/scrapers/flag-vin-graph.ts so
// the scrape CI runs the same logic automatically every cycle. Run: npx tsx scripts/flag-vin-graph.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { flagVinGraph } from "../lib/scrapers/flag-vin-graph";
config({ path: ".env.local" });

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

flagVinGraph(sb)
  .then((r) => {
    console.log(
      `DONE: ${r.vins} VINs scanned, flagged ${r.flagged} active deals, demoted ${r.demoted} misrepresented`,
    );
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
