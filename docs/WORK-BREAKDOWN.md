# Work breakdown — getting the ducks in a row

Two outcomes drive everything:

1. **Accuracy** — the numbers (GO/PASS + resale) are trustworthy because it's people's money. Target:
   measured single-digit MAPE and _provable_. ("100%" isn't real for valuation — _measured + honest_ is.)
2. **It has to SELL** — the system is already smart; it has to _look_ it. An elegant, cohesive UI that
   makes a dealer feel "this thing knows everything about this car" in one glance.

Claude Code is the integrator: owns scope, the high-risk core, and **all merges**. Antigravity + Kiro
take bounded, low-risk lanes (see `docs/handouts/`). Claude reviews + fixes everything to standard.

---

## HEAVY — Claude owns (high risk, high stakes)

### Accuracy engine (toward measured single-digit MAPE)

- **H1 · Config matching** — sub-bucket comps by drivetrain/fuel (4WD/diesel trucks vary 2×). Blocked on
  DATA today (sources hide it in structured fields); started capturing `driveType`/`fuelType` from
  AutoTrader. When it accumulates → build config sub-buckets, measure with the backtest, keep only if it
  lowers MAPE. _Biggest retail lever._
- **H2 · Harvest value fields from every source** — cars.com / TrueCar / Carvana JSON carry market-value
  / price-rating fields (like AutoTrader's KBB). Capture them → `mmr_value` → richer knowledge base.
- **H3 · Tighter comp stats** — exact-year buckets when deep; IQR outlier handling; regional adjustment
  (truck premium TX). Each change validated by `scripts/valuation-backtest.ts` — no unmeasured tweaks.
- **H4 · Salvage depth** — repair-cost-aware damage→value curve; the segment is conservative now but
  unvalidated (no free salvage-sold ground truth). Keep measuring the distribution.
- **H5 · VIN-decode enrichment** — fill missing year/make/model/trim so more cars match good comps.

### The hero UI surfaces (where the smart system becomes visible = where it sells)

- **U1 · The Deal page = the hero.** One cohesive page that shows EVERYTHING elegantly: source identity,
  GO/PASS with honest confidence, the valuation breakdown (comps vs KBB vs sold — the moat made visible),
  cross-source price compare, VIN-graph history/flags, days-on-market, one-tap contact. This is the
  "wow, it knows everything" moment. Claude architects; agents implement spec'd sub-components.
- **U2 · The Discovery feed = the daily driver.** Fast, beautiful, with the smart signals surfaced
  (confidence dots, brand source badges, cross-source, deal grade) — already partly done, needs cohesion.
- **U3 · One design language across 28 pages.** Audit, retire dead/duplicate pages, unify tokens +
  shared components so nothing feels bolted-on. Claude sets the system; agents apply it to bounded pages.

### Core infra (Claude only)

- smartFetch / anti-bot / fleet hardening, the scraping engine, the pipeline, all merges + governance.

---

## LIGHT — handed out (bounded, verifiable, low-risk)

- **Antigravity** (`docs/handouts/ANTIGRAVITY.md`) — CI/CD + infra: a real CI quality gate (tsc/lint/test),
  an accuracy-regression gate, finishing the headed-scrape CI + secrets, GitHub billing, dependabot.
- **Kiro** (`docs/handouts/KIRO.md`) — QA/data: unit tests for the new valuation primitives, a read-only
  data-quality audit script, and bounded empty-state/microcopy on 3 named pages.

## Lane map (do-not-cross)

| Area                                                                      | Owner                                  |
| ------------------------------------------------------------------------- | -------------------------------------- |
| `lib/scoring/*`, `lib/scrapers/*`, `lib/sources/*`, pipeline, smart-fetch | **Claude**                             |
| Deal page, Discovery feed, design system, page consolidation              | **Claude** (agents impl spec'd pieces) |
| `.github/`, Docker, fly.toml, deploy, secrets, billing                    | **Antigravity**                        |
| New `*.test.ts`, `scripts/qa-*.ts`, 3 named empty-state pages             | **Kiro**                               |

## Merge discipline

- Branch per task. **No `reset --hard` / `checkout .` / `clean` / force-push** (wiped work twice).
- Open a PR, tag Claude, **do not self-merge.** Claude integrates, resolves conflicts, fixes to standard.
- Update the `docs/ORCHESTRATION.md` ledger when you claim/finish work.
