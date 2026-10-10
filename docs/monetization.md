# Monetization: what exists today (architecture only)

**Product decision (Jonah, 2026-10-10): MikeHunt is free by design.** There is no payment system and
none is planned. Users pick their experience (tier) for free. Read from the code on `main` at fd9b212;
nothing here changes pricing, creates Stripe objects or calls Stripe. This is an inventory of what the
code contains, which parts are intentionally dormant, and the copy/cleanup left to match the decision.

## TL;DR

- **No checkout, on purpose.** Both checkout entry points return `410 Gone` (`/api/billing/checkout`,
  `POST /api/checkout/beta-access`). `/upgrade` is a free experience picker, not a paywall.
- **Gating is off, on purpose.** Every plan check is behind `GATING_ENABLED === "true"`, which is unset,
  so everyone gets full access. The daily deal-analysis meter is the one check worth keeping as a
  fair-use (anti-abuse) limit if gating is ever switched on.
- **Picking a tier is free and self-serve.** `PUT /api/workspace` writes
  `prefs.workspaceAccess = "community"` for any signed-in user, and `hasFullCustomerAccess()` treats
  `community` as full access. That is the intended model, not a loophole.
- **Dormant Stripe code remains.** `/api/billing/webhook` (signature-verified, idempotent via
  `stripe_events`, downgrades on cancel) and the `PLANS` catalogue in `lib/stripe.ts` still exist. Nothing
  in the app creates Checkout sessions, so the webhook never receives a grant. It can stay dormant or be
  removed; either way no copy should imply a purchase.

## Plans in code

`lib/stripe.ts` `PLANS` is the catalogue. `lib/auth/plan.ts` `Plan` is the set of values read from
`user_profiles.plan`.

| Plan id     | Where it comes from                                                                 | Price in code    | Stripe price env var               | Sellable today              |
| ----------- | ----------------------------------------------------------------------------------- | ---------------- | ---------------------------------- | --------------------------- |
| `free`      | default                                                                             | $0               | none                               | n/a                         |
| `community` | `user_preferences.prefs.workspaceAccess` (set by `/upgrade` → `PUT /api/workspace`) | $0               | none                               | n/a, self-serve             |
| `pro`       | webhook (recurring)                                                                 | 2900 cents/month | `STRIPE_PRO_MONTHLY_PRICE_ID`      | No (checkout 410, intended) |
| `pro_plus`  | webhook (recurring)                                                                 | 7900 cents/month | `STRIPE_PRO_PLUS_MONTHLY_PRICE_ID` | No (checkout 410, intended) |
| `lifetime`  | webhook (one-time, mode=payment)                                                    | 49900 cents once | `STRIPE_LIFETIME_PRICE_ID`         | No (checkout 410, intended) |
| `elite`     | listed in the `Plan` type and counted as paid by `isPaid()`                         | none             | none                               | Never; no price maps to it  |

The amounts in `PLANS` are display numbers only. Stripe's price objects are the source of truth for what
would be charged; `planForPrice()` only maps a price id to a plan id and never reads `amount`.

## Stripe wiring

| Piece                       | File                                                                                                     | State                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Client                      | `lib/stripe.ts` `getStripe()`                                                                            | Lazy. Returns `null` without `STRIPE_SECRET_KEY`; `stripeConfigured()` reports it.                                                                                                                                                                                                                                                                                                                                          |
| Price → plan                | `lib/billing/plan-for-price.ts`                                                                          | Unset env var → `priceId` undefined → never matches, so an unknown price can't grant a plan. Ranks `pro` < `pro_plus` < `lifetime`.                                                                                                                                                                                                                                                                                         |
| Checkout                    | `app/api/billing/checkout/route.ts`                                                                      | `410`, "Customer upgrades are free". No session creation anywhere in the app.                                                                                                                                                                                                                                                                                                                                               |
| Legacy checkout             | `app/api/checkout/beta-access/route.ts`                                                                  | `GET` redirects to `/upgrade`; `POST` is `410` (old divergent webhook, retired).                                                                                                                                                                                                                                                                                                                                            |
| Webhook                     | `app/api/billing/webhook/route.ts` (#255)                                                                | Signature-verified with `STRIPE_WEBHOOK_SECRET`; service-role writes. Handles `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `customer.subscription.created/updated/deleted`. Mode must match the plan (recurring → subscription, lifetime → payment). Subscriptions are re-read live from Stripe, so out-of-order events can't re-grant. Non-active status → `free`, never touching `lifetime`. |
| Idempotency                 | `supabase/migrations/20261010100000_stripe_events.sql`                                                   | Event id inserted before processing, released on failure so Stripe retries. Server-only table. (Open: #275/#279 tighten its grants.)                                                                                                                                                                                                                                                                                        |
| Columns                     | `user_profiles.plan`, `plan_started_at`, `plan_ended_at`, `stripe_customer_id`, `stripe_subscription_id` | Since `20261010040000_profile_privilege_lockdown.sql` client roles can't write these; only the service role can.                                                                                                                                                                                                                                                                                                            |
| Customer portal / cancel UI | none                                                                                                     | No Billing Portal session, no "manage subscription" page.                                                                                                                                                                                                                                                                                                                                                                   |
| CSP                         | `next.config.js`                                                                                         | `frame-src https://*.stripe.com` already allowed.                                                                                                                                                                                                                                                                                                                                                                           |

Env vars the billing surface reads (names only; set in Vercel, never commit values):
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_MONTHLY_PRICE_ID`,
`STRIPE_PRO_PLUS_MONTHLY_PRICE_ID`, `STRIPE_LIFETIME_PRICE_ID`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
(listed in `.env.example`, not read by any code today), and `GATING_ENABLED`.

## Gating: enforced vs only shown

"Enforced" means the server refuses or withholds something. All of it is inert while `GATING_ENABLED`
is unset, which is the intended state.

| Feature                                                                         | Where                                                                 | Enforced?                                               | Who passes                                          |
| ------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| Deal analysis meter (10 distinct deals/day)                                     | `app/api/deals/[id]/route.ts` → `meterDealView()`, `deal_views` table | Yes, `402 {locked:true}` when gating is on              | `community` + paid (`hasFullCustomerAccess`)        |
| Calibration dashboard                                                           | `app/api/calibration/route.ts`                                        | Yes, `{locked:true}` when gating is on                  | `community` + paid                                  |
| Saved-search email/SMS for new matches                                          | `lib/scrapers/pipeline.ts` (`notifyNewMatches`)                       | Yes when gating is on; free users keep the in-app inbox | **paid only** (`isPaid`; `community` does not pass) |
| Alert-engine web push (`lib/alerts/alert-engine.ts`, workers)                   | none                                                                  | **No**                                                  | everyone                                            |
| Price-drop email + push (`lib/scrapers/tools/alerts.ts`, `/api/alerts/process`) | none                                                                  | **No**                                                  | everyone with `notify_price_drops` not false        |
| Public API / MCP (`/api/keys`, `/api/mcp`)                                      | none                                                                  | **No** (Pro Plus feature on paper)                      | any signed-in user can mint a key                   |
| Bulk/fleet, Parts intelligence, Deal Check, Deal IQ, Price history + timing     | none                                                                  | **No** (listed as Pro / Pro Plus features in `PLANS`)   | everyone                                            |
| "10 VIN lookups/day", "3 saved searches" (Free plan features)                   | none                                                                  | **No**                                                  | not limited anywhere                                |
| Workspace "focused" vs "expanded"                                               | `lib/workspace.ts`, `/upgrade`                                        | UI only; changes which tools show in nav, not access    | everyone (dealers are always expanded)              |

Copy that contradicts the free model (to fix):

- The deal page's fair-use state (`app/(dashboard)/deal/[id]/page.tsx`, and the `402` message in
  `app/api/deals/[id]/route.ts`) says "Upgrade to Pro for unlimited…" and "resets at midnight". It
  should name a fair-use limit and say the reset is midnight UTC. Only visible when gating is on.
- `/upgrade` is titled "Free workspace upgrade"; it should read as a free "Choose your experience"
  picker.
- `PLANS[].features` (Pro / Pro Plus / Lifetime) describe paid tiers. Nothing renders `PLANS` today.
- The changelog header says "Every update to MikeHunt Pro."
- `app/api/admin/stats/route.ts` counts "paid" users as `plan in ('pro','elite')`; with no payments
  that number is always meaningless, and `elite` was never a real plan.
- `docs/CLEVER-MONETIZATION-TACTICS.md` is an older paid-funnel strategy doc; it is not a description of
  the code or the current product.

## Cleanup to match "free by design"

These are not gaps in a payment system; they are leftovers from one.

1. **Copy.** Remove "Upgrade to Pro", "buy" and "paid" wording from the app (rows above). Keep the daily
   deal-analysis meter as a fair-use limit with honest copy and the reset time stated (midnight UTC;
   `deal_views.day` is the UTC date, which is 6–7 PM in Missouri).
2. **Admin stats.** Stop counting `elite` (never sold) as paid.
3. **Gate helpers.** If gating is ever switched on for abuse control, route it through one helper.
   Today it is split between `isPaid` (pipeline email/SMS, where `community` does not pass, so a
   community user would lose saved-search email/SMS) and `hasFullCustomerAccess` (deal meter,
   calibration). Under a free model `isPaid` is the wrong check for notifications.
4. **Dormant Stripe code.** Decide whether to keep `lib/stripe.ts` `PLANS`, `lib/billing/*`, the webhook
   and the `STRIPE_*` env vars dormant or remove them. If they stay, nothing user-facing should read
   `PLANS`.
5. **`workspaceAccess` lives in user-writable prefs.** Fine while the tier is free and self-serve; note it
   if any tier ever carries a real restriction.
6. **Unused env var.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is in `.env.example` but read nowhere.
