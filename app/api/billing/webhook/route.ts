export const dynamic = "force-dynamic";

import * as Sentry from "@sentry/nextjs";
import type Stripe from "stripe";
import { NextRequest, NextResponse } from "next/server";
import { getStripe, stripeConfigured } from "@/lib/stripe";
import {
  highestPlan,
  planForPrice,
  type PaidPlanMatch,
} from "@/lib/billing/plan-for-price";
import { createServerComponentClient } from "@/lib/supabase";

// POST /api/billing/webhook: the ONLY Stripe webhook (POST /api/checkout/beta-access is retired, 410).
//
// Rules:
//  * Users are identified by metadata.user_id only; a Stripe customer is linked to at most one
//    user and never re-linked.
//  * Signature is verified with STRIPE_WEBHOOK_SECRET before anything else.
//  * Plans come only from PLANS price ids. Unknown prices are logged and never grant a paid plan.
//  * checkout.session.completed requires the mode that matches the plan (recurring -> subscription,
//    one-time -> payment) and payment_status 'paid' ('no_payment_required' only for a subscription
//    trial). Async payments are granted on checkout.session.async_payment_succeeded.
//  * Subscription state is re-fetched from Stripe (subscriptions.retrieve), never taken from the
//    payload, so out-of-order delivery (updated after deleted) can't re-grant a paid plan.
//  * Idempotency: stripe_events(id) is inserted before processing; a duplicate id is skipped. If
//    processing fails the row is removed so Stripe's retry is processed.
//  * Every Supabase error is captured to Sentry with the event id/type and returns 500 so Stripe retries.
//  * Writes use the service role. Since 20261010040000 client roles cannot write plan/role/stripe_*.

const ACTIVE_SUB_STATUSES = new Set(["active", "trialing"]);

class WebhookFailure extends Error {
  constructor(
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "WebhookFailure";
  }
}

function idOf(ref: string | { id: string } | null | undefined): string | null {
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

type Ctx = { eventId: string; eventType: string };

function reject(ctx: Ctx, reason: string, extra: Record<string, unknown> = {}) {
  console.warn(
    `[stripe webhook] rejected ${ctx.eventType} ${ctx.eventId}: ${reason}`,
    extra,
  );
  Sentry.captureMessage(`stripe webhook rejected: ${reason}`, {
    level: "warning",
    tags: { stripe_event_id: ctx.eventId, stripe_event_type: ctx.eventType },
    extra,
  });
}

function dbCheck(
  ctx: Ctx,
  what: string,
  error: { message?: string; code?: string } | null,
) {
  if (error) {
    throw new WebhookFailure(
      `supabase ${what} failed: ${error.code ?? ""} ${error.message ?? ""}`.trim(),
      error,
    );
  }
}

type Db = ReturnType<typeof createServerComponentClient>;

const CUSTOMER_ID = /^cus_[A-Za-z0-9]+$/;

/**
 * Link a Stripe customer to a user. Only sets stripe_customer_id when it is NULL or already equal,
 * and refuses a customer that is already linked to a different user. Returns false (after logging
 * to Sentry) when the link is refused; callers must not grant anything in that case.
 */
async function linkCustomer(
  db: Db,
  ctx: Ctx,
  userId: string,
  customerId: string,
): Promise<boolean> {
  if (!CUSTOMER_ID.test(customerId)) {
    reject(ctx, "malformed customer id", { customerId });
    return false;
  }
  const { data: others, error: e1 } = await db
    .from("user_profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .neq("id", userId)
    .limit(1);
  dbCheck(ctx, "customer ownership lookup", e1);
  if (others && others.length > 0) {
    reject(ctx, "customer already linked to another user", {
      customerId,
      userId,
    });
    return false;
  }
  const { data: linked, error: e2 } = await db
    .from("user_profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId)
    .or(`stripe_customer_id.is.null,stripe_customer_id.eq.${customerId}`)
    .select("id");
  dbCheck(ctx, "link customer", e2);
  if (!linked || linked.length === 0) {
    reject(
      ctx,
      "user already linked to a different customer (or no such user)",
      {
        customerId,
        userId,
      },
    );
    return false;
  }
  return true;
}

async function grantFromCheckout(
  stripe: Stripe,
  db: Db,
  ctx: Ctx,
  session: Stripe.Checkout.Session,
) {
  // metadata.user_id only. client_reference_id is NOT trusted: no session is created server-side
  // today (/api/billing/checkout is 410), and Payment Links let the buyer set client_reference_id.
  // A future server-created session must set metadata.user_id.
  const userId = session.metadata?.user_id;
  if (!userId)
    return reject(ctx, "checkout session has no metadata.user_id", {
      session: session.id,
    });

  const items = await stripe.checkout.sessions.listLineItems(session.id, {
    limit: 10,
  });
  const priceIds = items.data
    .map((li) => idOf(li.price as any))
    .filter(Boolean) as string[];
  const matches = priceIds.map((p) => planForPrice(p));
  if (matches.length === 0 || matches.some((p) => p === null)) {
    return reject(ctx, "unknown price", { session: session.id, priceIds });
  }
  const plan = highestPlan(matches as PaidPlanMatch[])!;

  const expectedMode = plan.recurring ? "subscription" : "payment";
  if (session.mode !== expectedMode) {
    return reject(ctx, "mode does not match plan", {
      session: session.id,
      mode: session.mode,
      plan: plan.id,
    });
  }
  const paid =
    session.payment_status === "paid" ||
    (plan.recurring && session.payment_status === "no_payment_required");
  if (!paid) {
    return reject(ctx, "checkout not paid", {
      session: session.id,
      payment_status: session.payment_status,
    });
  }

  const customerId = idOf(session.customer as any);

  if (plan.recurring) {
    const subId = idOf(session.subscription as any);
    if (!subId || !customerId)
      return reject(
        ctx,
        "subscription checkout without subscription/customer id",
        {
          session: session.id,
        },
      );
    if (!(await linkCustomer(db, ctx, userId, customerId))) return;
    // The plan itself comes from the live subscription state.
    return syncSubscription(stripe, db, ctx, subId, { userId, customerId });
  }

  if (customerId && !(await linkCustomer(db, ctx, userId, customerId))) return;
  const { error } = await db
    .from("user_profiles")
    .update({
      plan: plan.id,
      plan_started_at: new Date().toISOString(),
      plan_ended_at: null,
    })
    .eq("id", userId);
  dbCheck(ctx, "grant one-time plan", error);
}

async function syncSubscription(
  stripe: Stripe,
  db: Db,
  ctx: Ctx,
  subscriptionId: string,
  from?: { userId: string; customerId: string },
) {
  // Never trust the event payload: fetch the current state.
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = idOf(sub.customer as any);
  if (from && customerId !== from.customerId) {
    return reject(
      ctx,
      "subscription customer does not match checkout customer",
      {
        subscription: sub.id,
        customerId,
        checkoutCustomer: from.customerId,
      },
    );
  }
  const active = ACTIVE_SUB_STATUSES.has(sub.status);

  if (active) {
    if (!customerId) {
      return reject(ctx, "subscription has no customer", {
        subscription: sub.id,
      });
    }
    // Every item, like checkout: the plan is the highest KNOWN recurring price. Unknown items
    // (e.g. an add-on listed first) never grant anything and are logged; no known plan -> reject.
    const priceIds = (sub.items?.data ?? [])
      .map((it) => it.price?.id ?? null)
      .filter(Boolean) as string[];
    const known = priceIds
      .map((p) => planForPrice(p))
      .filter((m): m is PaidPlanMatch => !!m && m.recurring);
    const plan = highestPlan(known);
    if (!plan) {
      return reject(ctx, "unknown subscription price", {
        subscription: sub.id,
        priceIds,
      });
    }
    const unknown = priceIds.filter((p) => !planForPrice(p));
    if (unknown.length > 0) {
      console.warn(
        `[stripe webhook] ${ctx.eventId}: ignoring unknown subscription items`,
        unknown,
      );
    }
    let q = db
      .from("user_profiles")
      .update({
        plan: plan.id,
        stripe_subscription_id: sub.id,
        plan_ended_at: null,
      })
      .neq("plan", "lifetime")
      .eq("stripe_customer_id", customerId);
    if (from) q = q.eq("id", from.userId);
    const { error } = await q;
    dbCheck(ctx, "sync active subscription", error);
    // plan_started_at only when it wasn't set (first activation).
    const s = db
      .from("user_profiles")
      .update({ plan_started_at: new Date().toISOString() })
      .is("plan_started_at", null)
      .eq("stripe_subscription_id", sub.id);
    const { error: e2 } = await s;
    dbCheck(ctx, "stamp plan_started_at", e2);
    return;
  }

  // Not active (canceled, unpaid, incomplete_expired, past_due, paused...): downgrade only the user
  // whose CURRENT subscription is this one, and never a lifetime user.
  const { error } = await db
    .from("user_profiles")
    .update({
      plan: "free",
      stripe_subscription_id: null,
      plan_ended_at: new Date().toISOString(),
    })
    .eq("stripe_subscription_id", sub.id)
    .neq("plan", "lifetime");
  dbCheck(ctx, "downgrade subscription", error);
}

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
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json(
      { error: "Webhook signature failed" },
      { status: 400 },
    );
  }

  const ctx: Ctx = { eventId: event.id, eventType: event.type };
  const tags = { stripe_event_id: event.id, stripe_event_type: event.type };
  const db = createServerComponentClient();

  // Idempotency claim.
  let claimed = false;
  {
    const { error } = await db
      .from("stripe_events")
      .insert({ id: event.id, type: event.type });
    if (!error) {
      claimed = true;
    } else if (error.code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    } else if (error.code === "42P01" || error.code === "PGRST205") {
      // stripe_events migration not applied yet: process without the dedupe (handlers are
      // state-derived, so a replay converges to the same result).
      console.warn(
        "[stripe webhook] stripe_events table missing; processing without idempotency",
      );
    } else {
      Sentry.captureException(
        new WebhookFailure(
          `stripe_events insert failed: ${error.message}`,
          error,
        ),
        { tags },
      );
      return NextResponse.json({ error: "Temporary failure" }, { status: 500 });
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await grantFromCheckout(
          stripe,
          db,
          ctx,
          event.data.object as Stripe.Checkout.Session,
        );
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(stripe, db, ctx, sub.id);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    if (claimed) {
      const { error } = await db
        .from("stripe_events")
        .delete()
        .eq("id", event.id);
      if (error)
        Sentry.captureException(
          new WebhookFailure("stripe_events release failed", error),
          { tags },
        );
    }
    Sentry.captureException(e, { tags });
    console.error(`[stripe webhook] ${event.type} ${event.id} failed:`, e);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
