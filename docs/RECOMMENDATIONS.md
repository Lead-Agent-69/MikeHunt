# Recommendations: view signals → affinity → For You

Backend loop (no UI in this doc; the client hook is `lib/reco/client.ts`).

## Signals (`public.deal_signals`, migration `20261006010000_deal_signals.sql`)

| kind | where it is recorded | weight |
| --- | --- | --- |
| `open` | server-side in `GET /api/deals/[id]` for signed-in users (one per deal per day counts) | +1 |
| `save` | server-side in `POST /api/saved-cars` | +3 |
| `dwell` | client `POST /api/reco/signal { dealId, kind: "dwell", dwellMs }` | 0 under 5s, 30s = +1, cap +2 |
| `unsave` / `dismiss` | client beacon | −1.5 / −2 (dismissed listings never come back) |
| `interest_yes` / `interest_no` | client answer to the prompt `{ kind, facet }` | +2.5 / −1.5 |

Guests: `401`, nothing stored. Listing attributes are a server-side snapshot (make, model, year,
price, body, state, source, title class), so a signal still teaches after the listing is pruned.
No photos, no HTML, no free text.

## Affinity (`lib/intelligence/affinity.ts`)

Per-facet scores: model (0.30), make (0.15), price band (0.15), body (0.12), year band (0.08),
state (0.08), title class (0.07), source (0.05). Long-term half-life 30 days; signals in the last
6 hours count 1.5x (session intent).

## Ranking (`GET /api/reco/for-you`)

`rank = 0.55·affinity + 0.20·freshness + 0.15·locality + 0.10·quality`, minus 0.25 for listings
already opened.

- freshness: 1 within 72h of first seen, fading to 0 at 14 days
- locality: `prefs.homeLocation` = 1, `searchLocations` = 0.7
- every 7th slot (~15%) is an **exploration** pick: a make the user has no positive signal on,
  ranked by freshness + locality + quality, labeled "Something different from what you usually open"
- reasons cite the user's own views ("You looked at 3 Honda Accord"); no reason under 2 distinct listings
- flip economics and seller contact: flip desk only (`listingsForDesk`)

## "Interested in similar?" (`GET /api/reco/prompt`)

After 3+ distinct listings of one model were opened / saved / dwelled on (15s+) in the last 24h.
Not shown again for that model for 7 days after a yes/no, or after 2 dismisses of that model.
Copy: "You looked at N Make Model listings in the last day. Want more like these?" No scarcity,
no countdown.

## Retention

Raw signals: 90 days, max 2,000 rows per user (`prune_deal_signals()`). See `docs/RETENTION.md`.
