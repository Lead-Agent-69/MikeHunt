export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import { createServerComponentClient } from "@/lib/supabase";

// POST /api/billing/webhook — Handles Stripe events:
//   checkout.session.completed  → upgrade user to pro
//   customer.subscription.deleted → downgrade user to free
//   customer.subscription.updated → sync plan status
// No-op (503) when Stripe isn't configured.
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

  const supabase = createServerComponentClient();

  // ── Checkout completed → upgrade ─────────────────────────────────────────
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as any;
    const userId = session.metadata?.user_id;
    if (userId) {
      try {
        await supabase
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

  // ── Subscription cancelled → downgrade to free ────────────────────────────
  if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as any;
    const customerId = sub.customer;
    if (customerId) {
      try {
        await supabase
          .from("user_profiles")
          .update({
            plan: "free",
            stripe_subscription_id: null,
            plan_ended_at: new Date().toISOString(),
          })
          .eq("stripe_customer_id", customerId);
      } catch (e) {
        console.warn("[stripe webhook] downgrade failed:", e);
      }
    }
  }

  // ── Subscription updated (e.g. plan change, pause) ────────────────────────
  if (event.type === "customer.subscription.updated") {
    const sub = event.data.object as any;
    const customerId = sub.customer;
    const status = sub.status; // active, past_due, canceled, trialing, etc.
    if (customerId) {
      try {
        const newPlan =
          status === "active" || status === "trialing" ? "pro" : "free";
        await supabase
          .from("user_profiles")
          .update({ plan: newPlan })
          .eq("stripe_customer_id", customerId);
      } catch (e) {
        console.warn("[stripe webhook] subscription update failed:", e);
      }
    }
  }

  return NextResponse.json({ received: true });
}
