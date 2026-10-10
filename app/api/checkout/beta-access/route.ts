export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";

/**
 * GET /api/checkout/beta-access
 * Create Stripe checkout session for $1 beta trial
 */
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/upgrade", req.url));
}

/**
 * POST /api/checkout/beta-access
 * Handle Stripe webhook for beta subscription
 */
export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
    return NextResponse.json(
      { error: "Missing signature or webhook secret" },
      { status: 400 },
    );
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json(
      { error: "Billing is not configured" },
      { status: 503 },
    );
  }

  try {
    const body = await req.text();
    const event = stripe.webhooks.constructEvent(body, sig, webhookSecret);

    const supabase = await createClient();

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.user_id;

        if (!userId) {
          console.error("[beta-webhook] No user ID in session");
          break;
        }

        // Update user profile with beta access
        await supabase.from("user_profiles").upsert(
          {
            id: userId,
            subscription_tier: "pro",
            beta_access: true,
            beta_joined_at: new Date().toISOString(),
            subscription_status: "active",
            stripe_customer_id: session.customer as string,
            stripe_subscription_id: session.subscription as string,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "id",
          },
        );

        console.log(`[beta-webhook] Beta access granted to user ${userId}`);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        // Update subscription status
        await supabase
          .from("user_profiles")
          .update({
            subscription_status: subscription.status,
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;

        if (!userId) break;

        // Downgrade to free tier but keep beta_access flag
        await supabase
          .from("user_profiles")
          .update({
            subscription_tier: "free",
            subscription_status: "canceled",
            updated_at: new Date().toISOString(),
          })
          .eq("id", userId);

        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[beta-webhook] Error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 400 });
  }
}
