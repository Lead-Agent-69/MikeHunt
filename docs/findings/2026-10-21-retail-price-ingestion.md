# Retail price and importer accuracy

The available-data audit found 38,873 cached listing observations, including 24,572 amounts whose full purchase-price meaning could not be established. That count describes a local snapshot, not newly fetched inventory or unique vehicles. A large observation count is not proof of accurate cash prices, title status or personal profit.

This change repairs specific gaps in ingestion and display:

- Shared source conversion no longer copies a current bid into `buy_now_price`. Explicit buy-now fields remain separate.
- The shared importer retains adapter price evidence, original observation dates, metadata and title provenance instead of discarding them.
- Cars.com amounts with decimal cents are parsed as one number; ranges, payment strings and malformed separators are not concatenated into a larger price.
- The shared cash-term classifier rejects numeric prefixes of price ranges, malformed grouping, incomplete cents, phone numbers and shorthand such as `18k`. This also rechecks stored evidence text instead of accepting an old asking-price classification blindly.
- Cars.com reads explicit price terms only within the matching card's visible text, excluding scripts and templates. It uses the shared price classifier, rejects conflicting cash prices and requires an actual response observation date before establishing asking-price evidence. An unlabelled numeric field remains unverified.
- `smartFetch` retains the polite crawler's original body observation time, so cached HTML cannot acquire a new price-check date merely by being parsed again.
- CarGurus `expectedPrice` is a reference estimate when no reported price is present. It cannot support acquisition economics. Uninspected reported amounts remain unverified.
- Marketplace adapters for Cars.com, CarGurus, AutoTrader, TrueCar, eBay, Facebook and OfferUp no longer assume a clean title from ordinary used inventory. Bring a Trailer no longer assumes every auction car has a clean title. CPO status remains a vehicle-program attribute, not title proof. Where visible listing text explicitly states a title brand, the matching brand is retained with listing provenance; negated, conflicting and cosmetic claims remain unknown.
- Missing or invalid mileage stays unknown across Cars.com, CarGurus, AutoTrader, TrueCar, OfferUp and Carvana; explicitly reported zero survives the shared normalization step. OfferUp no longer collapses rebuilt and parts-only descriptions into salvage titles.
- IAA collection counts reflect rows actually accepted by persistence, including when buyer scope or quality checks reject a candidate.
- Market cards describe ended auctions as last observed bids and distinguish unknown auction timing. They no longer claim that bidding is open without timing evidence.

## Verification and limits

The targeted regression set covers money parsing, missing and zero mileage, title assumptions, explicit cash versus down-payment terms, conflicting prices, stale cached observations, bid/buy-now separation through the importer, accepted-row counts and rendered market-card wording. Full normal local and hosted CI results are recorded with the release receipts.

A single honest, policy-controlled Cars.com request returned `ok=false` with status zero. No retry, alternate identity or challenge escalation was used. Fresh live parser coverage for that source remains unverified; fixture coverage does not certify current availability. Collection access rules and daily write budgets are unchanged.

This release performs no manual production business-data writes and does not convert the private document candidates into paid transactions. Existing stored observations must be refreshed through normal ingestion; historical amounts, missing costs and old forecasts are not relabelled as verified outcomes. No schema migration is needed.
