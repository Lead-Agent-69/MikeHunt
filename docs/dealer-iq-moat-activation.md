# Activating the Dealer-IQ Calibration Moat

## What's already built (and why it's dormant)

The hardest part is done and shipping:

- `deal_outcomes` table + `/api/outcomes` + the **"Log a Sale"** form on `/insights` — a dealer can
  record *bought for $X, sold for $Y, recon $Z, N days*.
- `lib/scoring/calibration.ts` — learns per-dealer **multipliers** (transport / recon / resale) and a
  **profit bias** from those outcomes once a dealer has **≥5** with a completed sale.
- `lib/intelligence/deal-iq.ts` already consumes that bias + the dealer's **win-patterns**, so the IQ
  becomes personalized the moment outcomes exist.

**Why it does nothing today:** prod has **1 user, 0 completed sales**. Calibration never engages.
No code change fixes this — it's a **go-to-market loop**, not a feature gap. And per the no-fake-data
rule, we cannot seed fake outcomes to fake a working moat. It activates only with *real* logged sales.

## The chicken-and-egg, and how to break it

A dealer won't log sales until the app is worth the keystrokes; the app isn't personalized until they
log. Break it by making logging near-zero-effort and the payoff immediately visible.

### 1. Make logging a 2-tap loop, not a form
- On any deal a dealer saved/viewed, add **"I bought this"** → stamps predicted numbers.
- When a bought deal is N days old, the existing email/`user_feed_inbox` infra nudges
  **"Did it sell? Confirm the numbers."** Pre-fill *our* predictions; the dealer only edits the
  actuals that differ. (The `/insights` form already captures the right fields — this just routes a
  saved deal into it pre-populated, instead of a blank manual entry.)

### 2. Make the payoff visible fast
- After 5 logs, surface the calibration line we already compute: *"Calibrated to your shop — your
  recon runs 1.4× our estimate; resale 0.96×."* That single sentence is the reason to keep logging.
- Show it on `/insights` (already wired) **and** as a one-line banner on the deal page so the value is
  felt where decisions happen.

### 3. Seed it honestly with the founder
You operate in this space — log your **own real flips** first. That gives a real reference
calibration, proves the loop end-to-end, and is the only legitimate "seed" (real data, not fake).

### 4. Let aggregated outcomes lift everyone
Even before a given dealer hits 5 logs, anonymized outcomes across dealers improve the shared baseline
and power the already-built **source-ROI** view (*"your last 15 Copart buys averaged $2,847"*). Every
log helps the next dealer — the network effect.

## The flywheel

more logged outcomes → sharper per-dealer accuracy → stickier product + visible edge → referrals →
more dealers → more outcomes. This is the moat Visor/CarGurus structurally cannot copy: they serve
anonymous consumers and have no concept of a dealer's own cost structure.

## Metrics to watch

- **Calibration activation rate** — % of active dealers with ≥5 completed outcomes (the unlock).
- **Prediction accuracy trend** — `calibration.profitAccuracyPct` rising per dealer over time.
- **Log conversion** — % of "I bought this" that get a sale confirmed (drives the nudge cadence).

## Guardrails (keep it accurate, not theatrical)

- Never fabricate outcomes or sold prices. `sold_listings` stays empty until real sale data exists
  (dealer logs, or a paid sold-data feed — out of scope while free).
- Always show sample size / confidence so a 5-sample calibration isn't presented as gospel.

## Smallest next code step (when you're ready)

Wire **"I bought this" / "Confirm sale"** onto the deal + saved views, routing into the existing
`/api/outcomes`. That is the single highest-leverage change to start the loop — everything downstream
(calibration, personalized IQ, source ROI) already exists and turns on automatically.
