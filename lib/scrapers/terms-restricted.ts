// Client-safe (no node: imports) so cards and API mappers can tell a frozen gated row from live
// inventory. Re-exported by sweep-schedule.ts, which owns the sweep rules that use it.

/**
 * Sources whose own terms ban automated access (robots, spiders, scrapers) without written
 * permission. Reviewed 2026-10-05 (municibid and offerup added 2026-10-05; govdeals, allsurplus and
 * carparts_com added 2026-10-05). They are left out of the default sweep. Running one takes an
 * explicit SCRAPE_SOURCES opt-in by the operator, and the scraper logs that opt-in every sweep.
 *
 * Reviewed and still allowed: gsa_auctions (GSA Auctions terms only bind registered bidders and do
 * not ban automated reads; GSA also publishes a public listings API). curated_dealers reads
 * individual dealer sites listed in the curated registry, not a marketplace with a scraping ban.
 */
export const TOS_RESTRICTED_SOURCES: Record<string, string> = {
  cars_com:
    "cars.com/about/terms: no robots, crawlers or spiders to access, query, collect or scrape data",
  autotrader:
    "Autotrader terms: no automated means (robots, screen scrapers, spiders) to collect or index content",
  autotempest:
    "autotempest.com/legal: no bots, scrapers, crawlers or scripts without express written authorization",
  carvana:
    "carvana.com/terms-of-use: no bots, scripts, crawling, scraping or spidering unless expressly agreed",
  cargurus:
    "cargurus.com/about/terms-of-use: no scraping or data mining (crawlers only as its robots rules allow)",
  craigslist:
    "craigslist.org/about/terms.of.use: no collecting CL content via robots, spiders, scripts, scrapers or crawlers",
  ebay_motors:
    "eBay User Agreement: no robots, spiders or scrapers without permission. The licensed path is the Browse API (needs a key)",
  ebay_sold:
    "eBay User Agreement: no robots, spiders or scrapers without permission. The licensed path is the Browse API (needs a key)",
  copart:
    "Copart Member Terms (no spider/crawl/scrape) and Image & Data License (use the CSV download, not scraping)",
  publicsurplus:
    "publicsurplus.com terms: no robot, spider or automatic device to monitor or copy the site without written permission",
  municibid:
    "municibid.com/Home/Terms (05/04/26): no access through automated means or other than a standard browser, and no scraping, without a written agreement",
  offerup:
    "offerup.com/terms (2026-07-21) §7: no automated means (bot, robot, spider, script, crawler or scraper) to collect or extract data",
  govdeals:
    "Liquidity Services User Agreement (covers GovDeals and AllSurplus): no spiders, crawlers, robots or similar means to access the site, and no data mining",
  allsurplus:
    "Liquidity Services User Agreement (covers AllSurplus and GovDeals): no spiders, crawlers, robots or similar means to access the site, and no data mining",
  carparts_com:
    "carparts.com/help-center/terms-and-conditions §2.2: no automated methods like scripts or web crawlers, and no scraping, crawling or spidering",
};
