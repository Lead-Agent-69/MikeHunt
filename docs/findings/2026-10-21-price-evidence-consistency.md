# Price evidence consistency — 2026-10-21

## Confirmed gaps and changes

- Reinterpreting seller text discarded the saved price-check date. An old cash-price statement could become eligible again merely because a listing was touched. Reclassification now retains the original date, including invalid supplied dates, so it cannot imply a new source check.
- Stored descriptions and listing titles were omitted by some acquisition-price callers. The shared parser now inspects those source fields and recognizes both “price advertised is a down payment” and “advertised price is a down payment.” Reference-only flags in stored options also prevent acquisition math.
- Cross-source comparisons accepted 30-day-old observations and ended auctions with a buy-now amount. Shared comparison eligibility now requires an observation within seven days, a valid open auction window when supplied, a safe source link, and recent price-check evidence when dated. Retained amounts remain visible. Current-observation labels also use the existing 72-hour/24-hour source freshness rules; a recent comparison snapshot is not a promise of a live quote.
- Deal Check filtered source categories and vehicle condition without loading or checking price meaning. It now loads the shared source-evidence projections, rejects unclassified/payment/reference/bid amounts, and compares the confirmed cash price rather than an unrelated teaser amount. Its existing minimum cohort and self-exclusion gates remain.
- The scoring index lost seller classification and descriptions and fell back to raw advertised amounts when evidence was missing. It now uses the same source-supported cash eligibility as comparisons. Price bounds and sanity checks apply after cash meaning is established, allowing a $99 advertised teaser with an explicit $15,000 cash price to contribute $15,000 instead of being discarded or counted at $99. Current bids remain excluded.
- Market Explorer maintained a separate 30-day bid-evidence gate. It now consumes the shared evidence-current result before showing stored acquisition economics.
- Removed unsupported numerical accuracy claims from valuation comments. Asking-price proxy checks do not establish accuracy against completed transactions.

## Live read-only audit

At 2026-10-21 17:54:39 UTC, the MikeHunt project contained 36,507 stored active rows. Of these, 20,059 were observed in the preceding seven days and 19,922 also had no known elapsed auction end.

The latter set contained 16,561 rows without an explicit stored price-evidence kind, 3,123 asking-price tags, 113 unknown tags, 109 references and 16 current bids. Of the asking tags, 2,968 included a price-check date. These are stored-tag counts across photo and non-photo rows, not counts of confirmed current cash offers. Runtime parsing may establish additional explicit cash evidence. Missing tags are never permission to invent cash meaning or market accuracy.

The stricter gates can reduce valuation coverage. The correct recovery is source-detail verification and fresh evidence, not assigning an asking-price tag to every number. Existing stored analyses are refreshed through the normal ingestion or bounded rescore workflow; this change does not rewrite every historical analysis or actual transaction record.

## Verification and limits

The targeted suite passed 312 checks in 18 files. Local QA passed 44 desktop/phone browser flows and one real database contract check; the duplicate phone-only database check is intentionally skipped. Production dependency audit reported zero known vulnerabilities. Targeted regressions cover original check dates, malformed dates, week-old evidence, expired auctions, source descriptions, seller classification, reference flags, safe links, cash/teaser differences, conservative unknown states, self-exclusion and comparison range suppression. Local database contract QA uses isolated fixtures and real PostgREST projections, checks the source-comparison endpoint, and removes its own fixtures. Browser QA exercises light/dark themes, phone widths, comparison controls and mixed price labels.

No schema migration or artificial production records are required. An undated price-evidence record may use a recent listing observation as its time context for backward compatibility; a supplied old or malformed price-check date always excludes it. A valid URL and recent observation do not independently establish that a seller will honor a price. This release does not certify nationwide completeness, every photo, valuation accuracy or investment returns.
