# Source access basis (Legal / Compliance / TOS)

_Draft by Ren (security), 2026-10-10 CT. Built from `docs/source-access-matrix.md`, `lib/scrapers/terms-restricted.ts`, `lib/scrapers/source-compliance.ts` and PR #269 (`c810e79`). `docs/sources-master.md` did not exist on `main` or in any open PR when this was written; reconcile when it lands._

## Classes

| Class | Meaning |
|---|---|
| `api` | Official or partner API used under its published terms (key, quota). |
| `allowed` | Public pages; the site's terms do not ban automated access and robots.txt allows the paths we fetch. |
| `restricted` | The site's terms ban robots/scrapers/data mining, or require a licence/dealer account. Runs only on an explicit `SCRAPE_SOURCES` opt-in. |
| `operator_override` | **NOT permission.** The operator (Jonah) chose to run this source despite a terms ban, a robots.txt disallow, or a policy block. It carries legal risk (contract/ToS breach, CFAA-style access claims, copyright in photos/descriptions). It is a record of a business decision, not a clearance. |

Rule: every `robotsExempt` source is at least `operator_override`, because the exemption exists only to skip a robots.txt restriction.

## Runner sources (`lib/scrapers/runner.ts` createScraperRegistry)

| Runner id | Class | Basis |
|---|---|---|
| gsa_auctions | allowed (→ `api` once #271's api.gsa.gov adapter is the path) | GSA terms bind bidders only; public API exists |
| iaa | allowed | Published sitemap + lot pages (terms not formally reviewed; review) |
| independent_dealer | allowed | Individual dealer sites, robots-gated |
| curated_dealers | allowed per host, **except** `OPERATOR_RESTORED_HOSTS` → operator_override | `source-compliance.ts` |
| auto_discover | allowed | robots/sitemap first |
| truecar, vroom | allowed (terms not reviewed; review) | not in TOS list |
| acv, adesa, manheim | restricted | dealer licence; stubs |
| cars_com, autotrader, autotempest, carvana, craigslist, ebay_motors, copart, publicsurplus, municibid, offerup, govdeals, allsurplus, carparts_com | restricted | `TOS_RESTRICTED_SOURCES` |
| cargurus | operator_override | TOS bans scraping; robotsExempt (Jonah, #269); FlareSolverr |
| facebook_marketplace | operator_override | Meta terms ban automated collection; stealth browser; robotsExempt |
| ebay_sold | operator_override | eBay User Agreement bans scrapers; robotsExempt |

Restricted sources that are opted in via `SCRAPE_SOURCES` on a worker are **running under operator override** at that moment; /status should show that state next to the static class.

## Curated hosts restored by operator (`OPERATOR_RESTORED_HOSTS`) → operator_override

aeofmiami.com, prosalvage.com, rebuildautos.com, rebuild1.com, rebuildtrucks.com, globalautoauctions.com, casmiami.com, bidgodrive.com. Each still has a `SITE_POLICY_BLOCKS` entry recording a terms ban (`tos_bans_bots` / `tos_bans_copying` / `needs_permission`). Kill switch: `SCRAPE_TERMS_SAFE_ONLY=1`.

## robotsExempt (PR #269) — Jonah's rule, unchanged, risk recorded

Static list (`SourceConfig.robotsExempt`): recar, ae-of-miami (+aeofmiami.com), facebook-marketplace, cargurus, ebay-sold, salvage-trucks-auction, royal-drive, parts-farm.

Dynamic list (`lib/scrapers/polite/robots-exempt.ts` refreshRecentProducers): **every** `scraper_runs.source` with rows in the last 7 days and **every host** in `deals.source_url` seen in the last 7 days. In practice this exempts every producing source, including restricted ones, from robots.txt.

Risks, stated plainly:
1. robots.txt is not enforced for any source that is currently producing rows. "Robots always" holds only for new or idle sources.
2. Crawl-delay is not honoured for exempt hosts: Crawl-delay is read only inside `robotsFor()`, which is skipped for exempt URLs, so pacing falls back to `POLITE_MIN_GAP_MS` (3 s) + jitter.
3. Exempt hosts keep their original headers in `scraperFetch` (browser User-Agent strings on A&E/CDG fetches), so "honest UA" does not hold for them.
4. Exemptions match by bare host and subdomains: ebay-sold exempts all of ebay.com (incl. ebay_motors); facebook-marketplace exempts all of facebook.com.
5. Declared registry `rateLimit` (e.g. copart/iaa 2 req/60 s) is not wired into `DomainLimiter`.

## Accepted risks (operator decision, 2026-10-10)

Jonah (operator) reviewed these and chose to keep current behaviour. They are recorded as accepted risks, not permission and not fixed:

1. **Recent-producer robots exemption.** `refreshRecentProducers` (robots-exempt.ts) exempts every source that produced rows in the last 7 days, plus every host in `deals.source_url`, from robots.txt. Restricted sources are included, and exempt hosts also skip Crawl-delay; pacing falls back to a 3s minimum gap plus jitter. Risk: crawling against a site's stated robots and terms policy, which can mean IP or legal action from the site operator.
