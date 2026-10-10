export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * GET /api/checkout/beta-access
 * The $1 beta checkout is retired (see /api/billing/checkout -> 410). Old links land on /upgrade.
 */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/upgrade", req.url));
}

/**
 * POST /api/checkout/beta-access
 * Retired. This used to be a second, divergent Stripe webhook that wrote columns user_profiles does
 * not have (subscription_tier, beta_access, subscription_status, ...) through the cookie/anon client,
 * so every write failed silently. Stripe events are handled only by /api/billing/webhook (signature
 * verified, service role, real plan / stripe_* columns). Since 20261010040000 the client roles cannot
 * write plan / role / stripe_* at all, so no billing write may come from a user-scoped client.
 */
export async function POST() {
  return NextResponse.json(
    { error: "Gone. Stripe webhooks are handled at /api/billing/webhook." },
    { status: 410 },
  );
}
