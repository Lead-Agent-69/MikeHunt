# Monetization: what exists today (architecture only)

Read from the code on `main` at fd9b212 (2026-10-10). Nothing here changes pricing, creates Stripe objects
or calls Stripe. It records what is wired, what is enforced, what is only shown, and the gaps to close
before charging anyone.

## TL;DR

- **Nobody can pay today.** Both checkout entry points return `410 Gone` (`/api/billing/checkout`,
  `POST /api/checkout/beta-access`). `/upgrade` is a free "workspace" chooser, not a paywall.
- **The receiving side is real.** `/api/billing/webhook` verifies signatures, maps Stripe price ids to
  plans, is idempotent (`stripe_events`) and downgrades on cancel. It only acts on Checkout sessions
  that carry `metadata.user_id`, and nothing in the app creates those any more.
- **Gating is off.** Every paid-feature check is behind `GATING_ENABLED === "true"`. With it unset,
  everyone has unlimited access.
- **Even with gating on, the free tier is one-click.** `PUT /api/workspace` writes
  `prefs.workspaceAccess = "community"` for any signed-in user, and `hasFullCustomerAccess()` treats
  `community` like a paid plan. Turning gating on today would only meter users who never visited
  `/upgrade`.

## Plans in code

`lib/stripe.ts` `PLANS` is the catalogue. `lib/auth/plan.ts` `Plan` is the set of values read from
`user_profiles.plan`.

| Plan id     | Where it comes from                                                                 | Price in code    | Stripe price env var               | Sellable today             |
| ----------- | ----------------------------------------------------------------------------------- | ---------------- | ---------------------------------- | -------------------------- |
| `free`      | default                                                                             | $0               | none                               | n/a                        |
| `community` | `user_preferences.prefs.workspaceAccess` (set by `/upgrade` → `PUT /api/workspace`) | $0               | none                               | n/a, self-serve            |
| `pro`       | webhook (recurring)                                                                 | 2900 cents/month | `STRIPE_PRO_MONTHLY_PRICE_ID`      | No (checkout 410)          |
| `pro_plus`  | webhook (recurring)                                                                 | 7900 cents/month | `STRIPE_PRO_PLUS_MONTHLY_PRICE_ID` | No (checkout 410)          |
| `lifetime`  | webhook (one-time, mode=payment)                                                    | 49900 cents once | `STRIPE_LIFETIME_PRICE_ID`         | No (checkout 410)          |
| `elite`     | listed in the `Plan` type and counted as paid by `isPaid()`                         | none             | none                               | Never; no price maps to it |

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

"Enforced" means the server refuses or withholds something. All of it is inert unless
`GATING_ENABLED=true`.

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

Shown but not backed:

- The deal page's locked state (`app/(dashboard)/deal/[id]/page.tsx`) says "Upgrade to Pro for
  unlimited…" and links to `/upgrade`, which offers a free workspace and no Pro purchase. Only visible
  when gating is on.
- `PLANS[].features` lists limits and features that no code enforces (rows above). Nothing renders
  `PLANS` today, so this is a latent promise, not a live one.
- The changelog header says "Every update to MikeHunt Pro."
- `docs/CLEVER-MONETIZATION-TACTICS.md` is an older strategy doc; it is not a description of the code.

## Gaps before charging

1. **Checkout.** Re-enable a session-creating route that sets `metadata.user_id`, `mode` per plan and the
   configured price id, with success/cancel URLs. The webhook already expects exactly this.
2. **Self-serve `community`.** Decide whether `community` stays a full-access free tier. If paid plans
   should mean something, `hasFullCustomerAccess()` must stop treating `community` as paid, or
   `workspaceAccess` must move to a server-managed column (`user_preferences` is user-writable under its
   own-row RLS, so a client could set it directly too).
3. **One gate helper.** Gating is split between `isPaid` (pipeline notifications) and
   `hasFullCustomerAccess` (deal meter, calibration). Pick per feature and route every check through one
   `requirePlan(feature)` so the matrix above lives in one table.
4. **Unenforced features.** Either gate them (API keys/MCP, bulk/fleet, parts, alert/price-drop push and
   email, saved-search and VIN limits) or drop them from `PLANS[].features` before any pricing page reads
   it.
5. **`elite`.** Remove from `Plan`/`isPaid`, or add a price. `app/api/admin/stats/route.ts` counts paid
   users as `plan in ('pro','elite')`, which misses `pro_plus` and `lifetime`.
6. **Manage/cancel.** No Billing Portal or in-app cancel; needed alongside checkout.
7. **Pricing UI.** No page renders `PLANS`. The deal-page lock copy should point at a real purchase
   path once one exists, and say nothing about Pro until then.
8. **Meter timezone.** `deal_views.day` is the UTC date, so "resets at midnight" is midnight UTC
   (6–7 PM in Missouri).
9. **Unused env var.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` is in `.env.example` but read nowhere
   (Checkout is server-redirect, so it may never be needed).
