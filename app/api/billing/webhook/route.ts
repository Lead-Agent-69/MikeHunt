export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createServerComponentClient } from "@/lib/supabase";

// POST /api/billing/webhook — Stripe events. Verifies the signature, then upgrades the user on a
// completed checkout. No-op (503) when Stripe isn't configured.
export async function POST(req: NextRequest) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json(
      { error: "Billing not configured." },
      { status: 503 },
    );
  }
  const stripe = getStripe()!;

  const sig = req.headers.get("stripe-signature");
  if (!sig)
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });

  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: `Webhook signature failed: ${e.message}` },
      { status: 400 },
    );
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const userId = session.metadata?.user_id;
    if (userId) {
      try {
        await createServerComponentClient()
          .from("user_profiles")
          .update({
            plan: "pro",
            plan_started_at: new Date().toISOString(),
            stripe_customer_id: session.customer || null,
            stripe_subscription_id: session.subscription || null,
          })
          .eq("id", userId);
      } catch (e) {
        console.warn("[stripe webhook] upgrade failed:", e);
      }
    }
  }

  return NextResponse.json({ received: true });
}
