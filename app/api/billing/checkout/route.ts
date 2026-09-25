export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured, PLANS } from "@/lib/stripe";
import { getServerUser } from "@/lib/server-supabase";

// POST /api/billing/checkout { priceId } — start a Stripe Checkout. 503 when Stripe isn't configured.
export async function POST(req: NextRequest) {
  if (!stripeConfigured()) {
    return NextResponse.json(
      { error: "Billing not configured. Set STRIPE_SECRET_KEY + price IDs." },
      { status: 503 },
    );
  }
  const stripe = getStripe()!;

  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Accept a plan id (preferred — price IDs stay server-side) or a raw priceId.
  let body: any = {};
  try {
    body = await req.json();
  } catch {}
  const priceId: string | undefined =
    body.priceId || PLANS.find((p) => p.id === body.plan)?.priceId;
  if (!priceId) {
    return NextResponse.json(
      { error: "Unknown plan or price not configured." },
      { status: 400 },
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
  const isLifetime = priceId === process.env.STRIPE_LIFETIME_PRICE_ID;

  try {
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email || undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: isLifetime ? "payment" : "subscription",
      success_url: `${appUrl}/settings?upgraded=true`,
      cancel_url: `${appUrl}/upgrade`,
      metadata: { user_id: user.id },
    });
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Checkout failed" },
      { status: 500 },
    );
  }
}
