# Multi-Agent Orchestration — read before you touch anything

Three agents share this repo. **Claude Code is the integrator and owns scope + all merges.**
This file is the single source of truth for who-owns-what and what's already built. Update the
ledger when you claim or finish work so nobody rebuilds what exists (that's how we ended up with
two contact extractors and two filter systems).

## Lanes (edit ONLY your paths)

| Agent                             | Owns                                                                                           | Must NOT touch                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------- |
| **Claude Code** (integrator)      | `lib/**`, `app/api/**`, pipeline, scrapers, discovery, valuation/scoring, data; **all merges** | —                                       |
| **Antigravity** (UI/visual)       | `components/**`, `app/(dashboard)/**` page layout & styling, `app/globals.css`                 | `lib/**`, `app/api/**`                  |
| **Kiro** (quality, additive-only) | **NEW files only**: `**/*.test.ts`, `scripts/audit-*.ts`, `docs/**`                            | editing any existing `lib/`/`app/` file |

## Hard rules

1. **Stay in your lane.** Need a field/endpoint outside it? Ask Claude Code — don't reach in.
2. **Your own branch/worktree.** Never share a working tree. Hand Claude Code your branch; it integrates.
3. **BANNED, always:** `git reset --hard`, `git checkout .`, `git clean`. These destroyed work twice.
4. **Small, frequent commits.** Don't sit on a giant uncommitted diff.
5. **Claude Code owns every merge** and decides what lands on `main`.

## Ledger — what already exists (do NOT rebuild)

- Contact extraction → `lib/scrapers/tools/extract-contact.ts` (`extractContactInfo`, writes
  `seller_phone`/`seller_email`, recovers VINs). UI: `components/deal/ContactSeller.tsx`.
- Advanced filtering → `/market` page + `/api/market/explore` (multi-state, lane, seller-type,
  ROI, curated⟷whole-market, facets incl. `priceHistogram` + `laneProfit`).
- Salvage network → 95 curated sites + discovery engine (`lib/scrapers/discovery/**`).
- Valuation → `lib/scoring/**` (condition-aware, sold-anchored, placeholder-price comp guard,
  market-relative price-sanity). Per-deal viz: `PriceMilesScatter/Chart`, `PriceSparkline`,
  `PriceTimeline`.
- Lanes/colors → `lib/discovery/categorize.ts` (`dealLane`, `LANE_COLORS`).

## Open work (claim it in this list before starting)

- [x] Antigravity: graphs/visualizers (price-distribution, profit/cost waterfall, lane donut) +
      Visor look-and-feel polish + `/market` visual pass.
- [ ] Kiro: data-quality audit script (fake prices, dup VINs, missing fields, comp-coverage gaps) + test coverage for scraper parsers / `deal-analyzer` / `market-value` / `condition-value`.
- [ ] Claude Code: comp-depth tail (graded fallback), scraper hardening, land convergence on `main`.
