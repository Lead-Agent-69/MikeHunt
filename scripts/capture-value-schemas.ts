// scripts/capture-value-schemas.ts
//
// Fleet-assisted schema discovery. The retail sources embed a third-party market value (KBB/IMV/etc.)
// in their JSON, but each under a different field name — and we can't always inspect from a flagged IP.
// So the FLEET (clean IP) runs this: it fetches a sample from each source, locates the value-shaped
// fields with the schema-agnostic detector, and PRINTS the surrounding structure. Read the output (docker
// logs), and we write the PRECISE harvest from the real fields — no guessing in production valuation.
//
// On the fleet:  docker compose run --rm scraper npx tsx scripts/capture-value-schemas.ts
// Locally (clean IP): ENABLE_HEADED_SCRAPERS=1 npx tsx scripts/capture-value-schemas.ts

import * as dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { findMarketValue } from "../lib/scrapers/extract-market-value";

// Dump every key whose name or parent looks value-ish, with its value + path — the raw evidence.
function dumpValueFields(
  obj: any,
  ask: number,
  prefix = "",
  out: string[] = [],
) {
  if (!obj || typeof obj !== "object" || out.length > 40) return out;
  const RE =
    /price|value|market|kbb|mmr|fair|advisor|appraisal|book|rating|deal|msrp|saving/i;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") dumpValueFields(v, ask, p, out);
    else if (RE.test(k) && (typeof v === "number" || typeof v === "string"))
      out.push(`    ${p} = ${JSON.stringify(v)}`);
  }
  return out;
}

async function main() {
  const { smartFetch, closeSmartFetch } =
    await import("../lib/scrapers/smart-fetch");

  // Each source: a sample URL + how to pull one listing object out of the HTML.
  const SOURCES: {
    name: string;
    url: string;
    extract: (html: string) => { obj: any; ask: number } | null;
  }[] = [
    {
      name: "cars_com",
      url: "https://www.cars.com/shopping/results/?stockType=used&maximum_distance=100&zip=30303",
      extract: (html) => {
        const m = html.match(/data-vehicle-details="([^"]*)"/);
        if (!m) return null;
        const obj = JSON.parse(
          m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&"),
        );
        return { obj, ask: Number(String(obj.price).replace(/[^0-9]/g, "")) };
      },
    },
    {
      name: "truecar",
      url: "https://www.truecar.com/used-cars-for-sale/listings?zip=30303&searchRadius=500",
      extract: (html) => {
        const m = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (!m) return null;
        const nd = JSON.parse(m[1]);
        let apollo: any = null;
        (function w(o: any) {
          if (!o || typeof o !== "object" || apollo) return;
          for (const k of Object.keys(o)) {
            if (k.startsWith("ConsumerSummaryListing:")) return (apollo = o);
            w(o[k]);
          }
        })(nd);
        if (!apollo) return null;
        const deref = (r: any) => (r && r.__ref ? apollo[r.__ref] : r);
        const lk = Object.keys(apollo).find((k) =>
          k.startsWith("ConsumerSummaryListing:"),
        )!;
        const L = apollo[lk];
        // Resolve one level of refs so value sub-objects are visible.
        const obj: any = {};
        for (const k of Object.keys(L)) obj[k] = deref(L[k]);
        const pr = deref(L.pricing) || {};
        return { obj, ask: Number(pr.listPrice) || 0 };
      },
    },
    {
      name: "autotrader",
      url: "https://www.autotrader.com/cars-for-sale/all-cars?zip=30303&searchRadius=100",
      extract: (html) => {
        const m = html.match(
          /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/,
        );
        if (!m) return null;
        const nd = JSON.parse(m[1]);
        const inv = nd?.props?.pageProps?.__eggsState?.inventory || {};
        const id = Object.keys(inv).find((k) => inv[k]?.vin);
        if (!id) return null;
        const o = inv[id];
        return { obj: o, ask: Number(o.pricingDetail?.displayPrice) || 0 };
      },
    },
  ];

  for (const s of SOURCES) {
    console.log(`\n========== ${s.name} ==========`);
    try {
      const { html, blocked, tier } = await smartFetch(s.url);
      if (blocked) {
        console.log(`  BLOCKED (no tier passed) — needs a cleaner IP.`);
        continue;
      }
      console.log(`  fetched via "${tier}", ${html.length}B`);
      const sample = s.extract(html);
      if (!sample) {
        console.log(
          `  could not extract a listing object (structure changed?)`,
        );
        continue;
      }
      console.log(`  ask price: $${sample.ask}`);
      const detected = findMarketValue(sample.obj, sample.ask);
      console.log(
        `  findMarketValue() detected: ${detected ? "$" + detected : "nothing"}`,
      );
      const fields = dumpValueFields(sample.obj, sample.ask);
      console.log(`  value-ish fields in the listing JSON:`);
      console.log(fields.length ? fields.join("\n") : "    (none found)");
    } catch (e) {
      console.log(`  error: ${(e as Error).message}`);
    }
  }

  await closeSmartFetch();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
