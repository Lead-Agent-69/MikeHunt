// Read-only, first-page source diagnostics. No Supabase writes, refresh-date changes or activation.
import { load } from "cheerio";
import {
  DEALER_CMS_SITES,
  parseDgInventory,
  parseListingPage,
  cardToDeal,
} from "../lib/scrapers/platforms/dealer-cms";
import { politeFetch } from "../lib/scrapers/polite/polite-fetch";
import { SITE_POLICY_BLOCKS } from "../lib/scrapers/source-compliance";

async function main() {
  const ids = process.argv.slice(2);
  if (!ids.length)
    throw new Error(
      "Supply explicit dealer source IDs, such as dg-auto stjames-auto damage-com.",
    );
  for (const id of ids) {
    const site = DEALER_CMS_SITES.find((s) => s.sourceId === id);
    if (!site) {
      console.log(
        JSON.stringify({
          source: id,
          status: "unsupported_diagnostic",
          writes: 0,
        }),
      );
      continue;
    }
    const host = new URL(site.baseUrl).hostname.replace(/^www\./, "");
    if (SITE_POLICY_BLOCKS[host]) {
      console.log(
        JSON.stringify({
          source: id,
          status: "permission_required",
          reason: SITE_POLICY_BLOCKS[host].kind,
          writes: 0,
        }),
      );
      continue;
    }
    try {
      const response = await politeFetch(site.inventoryUrl, {
        maxRetries: 0,
        timeoutMs: 15000,
        freshForMs: 0,
      });
      if (!response.ok) {
        console.log(
          JSON.stringify({
            source: id,
            status: "unavailable",
            http: response.status,
            reason: response.skipped,
            observedAt: null,
            writes: 0,
          }),
        );
        continue;
      }
      const $ = load(response.body);
      const parsed =
        site.layout === "dg-native"
          ? parseDgInventory($, response.url)
          : parseListingPage(
              $,
              response.url,
              site.detailPattern ? [site.detailPattern] : undefined,
            );
      const rows = parsed.cards
        .map((c) => cardToDeal(c, site, response.observedAt))
        .filter(Boolean);
      console.log(
        JSON.stringify({
          source: id,
          url: response.url,
          status: rows.length
            ? "first_page_output"
            : "no_parsed_first_page_rows",
          observedAt: response.observedAt ?? null,
          parsedCards: parsed.cards.length,
          reportedTotal: parsed.total,
          usableFirstPage: rows.length,
          withPhotos: rows.filter((r) => r!.images?.length).length,
          sample: rows.slice(0, 2).map((r) => ({
            url: r!.source_url,
            title: r!.title,
            advertisedAmount: r!.ask_price,
            photos: r!.images?.length,
            titleCondition: r!.condition,
          })),
          writes: 0,
          completeScopedRun: false,
        }),
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          source: id,
          status: "unavailable",
          reason: error instanceof Error ? error.message : "request failed",
          writes: 0,
        }),
      );
    }
  }
}
main().catch(() => {
  console.error("Source diagnostic failed; no catalogue changes were made.");
  process.exitCode = 1;
});
