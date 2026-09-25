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
  try {
    const supabase = await createClient();

    // Check if user is authenticated
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      // Not authenticated - redirect to register with return URL
      return NextResponse.redirect(
        new URL(`/register?returnTo=/beta`, req.url),
      );
    }

    // Check if user already has beta access
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("subscription_tier, beta_access")
      .eq("id", user.id)
      .single();

    if (profile?.beta_access || profile?.subscription_tier !== "free") {
      // Already has access - redirect to dashboard
      return NextResponse.redirect(new URL("/scan", req.url));
    }

    // Create Stripe checkout session (billing degrades to "not configured" without keys).
    const stripe = getStripe();
    if (!stripe) {
      return NextResponse.json(
        { error: "Billing is not configured" },
        { status: 503 },
      );
    }
    const session = await stripe.checkout.sessions.create({
      customer_email: user.email,
      client_reference_id: user.id,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "DealerHunt Pro - Beta Access",
              description:
                "$1 for 30 days, then $23/month (20% lifetime discount)",
              images: ["https://dealerhunt.pro/og-image.png"],
            },
            recurring: {
              interval: "month",
            },
            unit_amount: 100, // $1.00 in cents
          },
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: 0, // No additional trial, $1 is the trial
        metadata: {
          user_id: user.id,
          beta_access: "true",
          lifetime_discount: "20",
          regular_price: "2300", // $23 in cents (after trial)
        },
      },
      metadata: {
        user_id: user.id,
        beta_access: "true",
      },
      success_url: `${new URL(req.url).origin}/beta/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${new URL(req.url).origin}/beta`,
      allow_promotion_codes: false, // Beta price is already discounted
    });

    return NextResponse.redirect(session.url || "/beta");
  } catch (error: any) {
    console.error("[beta-checkout] Error:", error);
    return NextResponse.json(
      { error: "Failed to create checkout session", details: error.message },
      { status: 500 },
    );
  }
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
    return NextResponse.json(
      { error: "Webhook error", details: error.message },
      { status: 400 },
    );
  }
}
