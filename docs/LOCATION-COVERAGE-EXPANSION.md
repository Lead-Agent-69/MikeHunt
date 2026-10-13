# Location coverage expansion

## Verified code gaps addressed

- All-lane buyer plans omitted the existing CarGurus and AutoTempest adapters. They are now candidates; registry enablement, source authorization and executor policy still decide whether they run.
- CarGurus ignored buyer location without an explicit ZIP. Buyer states now take precedence and search each configured metro center, including the 17 Missouri anchors. Background runs follow planned sweep centers; standalone unscoped runs retain their existing fallback.
- CarGurus dropped reported seller city/state. Valid source-reported fields are preserved; search centers never become listing locations. The default clean condition is marked source_default, not title evidence.
- Multi-center CarGurus requests are capped at three pages per center, deduplicated by source ID and persisted per completed center.

## Operational limits

CarGurus remains disabled in the runner because its earlier live verification encountered an access challenge. This change does not activate it, purchase a solver, bypass access restrictions, reset quotas, or prove new inventory. Existing robots/terms policy remains mandatory. Registry counts are candidates, not successful collection or cars available for a user.

Missouri's curated entries are predominantly salvage/rebuilder sources. Do not widen a personal buyer's eligibility to those lanes simply to inflate results. Preserve buyer mode, condition tolerance, budget, make/model and actual listing location across every collection job.

## Next source qualification

Official retail inventory pages found for Missouri (research only, not active coverage):

- Bommarito Auto Group, St. Louis area: https://www.bommarito.com/searchused.aspx
- Joe Machens Auto Group, Columbia/Jefferson City area: https://www.machens.com/searchused.aspx
- Corwin Ford of Springfield: https://www.corwinfordofspringfield.com/

Before adding these to collection: review current terms and robots, establish allowed feed/crawl access, verify parser output with cash price versus financing disclosures, listing URL, actual dealer location, photos and availability, then record a scoped run outcome. Do not label these Working merely from an accessible inventory page. Expand from the home market to user-approved neighboring markets, keeping location labels truthful and saved unavailable cars intact.

## Acceptance still required

- Authorized real-source runs, with discovered / accepted / saved / visible counts separated.
- Personal and reseller buyer scenarios, including Missouri and another state, confirmed in a connected browser.
- State/make/model/price narrowing, pagination beyond the first results, stale listings, and source failures.
- No profitability claim without adequate price, condition, costs and comparable-sale evidence. Asking prices are not sold prices; inventory breadth cannot certify margins.
