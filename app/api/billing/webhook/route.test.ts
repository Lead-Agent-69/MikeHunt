// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

const PRO = "price_pro_monthly";
const PRO_PLUS = "price_pro_plus_monthly";
const LIFETIME = "price_lifetime";

const state = vi.hoisted(() => ({
  event: null as any,
  lineItems: [] as any[],
  subscription: null as any,
  calls: [] as any[],
  errorFor: (_c: any): any => null,
  dataFor: (_c: any): any => undefined,
  badSignature: false,
}));
const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));
const stripeApi = vi.hoisted(() => ({
  listLineItems: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@sentry/nextjs", () => sentry);

vi.mock("@/lib/stripe", () => ({
  stripeConfigured: () => true,
  getStripe: () => ({
    webhooks: {
      constructEvent: () => {
        if (state.badSignature) throw new Error("bad sig");
        return state.event;
      },
    },
    checkout: { sessions: { listLineItems: stripeApi.listLineItems } },
    subscriptions: { retrieve: stripeApi.retrieve },
  }),
  PLANS: [
    { id: "free", name: "Free", amount: 0, interval: null, features: [] },
    {
      id: "pro",
      name: "Pro",
      priceId: "price_pro_monthly",
      amount: 2900,
      interval: "month",
      features: [],
    },
    {
      id: "pro_plus",
      name: "Pro Plus",
      priceId: "price_pro_plus_monthly",
      amount: 7900,
      interval: "month",
      features: [],
    },
    {
      id: "lifetime",
      name: "Lifetime",
      priceId: "price_lifetime",
      amount: 49900,
      interval: null,
      features: [],
    },
  ],
}));

vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({
    from(table: string) {
      const call: any = {
        table,
        op: null,
        payload: null,
        filters: [] as any[],
      };
      state.calls.push(call);
      const b: any = {
        insert(p: any) {
          call.op = "insert";
          call.payload = p;
          return b;
        },
        update(p: any) {
          call.op = "update";
          call.payload = p;
          return b;
        },
        delete() {
          call.op = "delete";
          return b;
        },
        eq(c: string, v: any) {
          call.filters.push(["eq", c, v]);
          return b;
        },
        neq(c: string, v: any) {
          call.filters.push(["neq", c, v]);
          return b;
        },
        is(c: string, v: any) {
          call.filters.push(["is", c, v]);
          return b;
        },
        or(expr: string) {
          call.filters.push(["or", expr]);
          return b;
        },
        limit(n: number) {
          call.filters.push(["limit", n]);
          return b;
        },
        select(cols: string) {
          if (!call.op) call.op = "select";
          else call.returning = cols;
          return b;
        },
        then(res: any, rej: any) {
          const custom = state.dataFor(call);
          const data =
            custom !== undefined
              ? custom
              : call.op === "select"
                ? []
                : call.returning
                  ? [{ id: "user-1" }]
                  : null;
          return Promise.resolve({ error: state.errorFor(call), data }).then(
            res,
            rej,
          );
        },
      };
      return b;
    },
  }),
}));

import { POST } from "./route";

function req() {
  return new NextRequest("http://localhost/api/billing/webhook", {
    method: "POST",
    body: "{}",
    headers: { "stripe-signature": "t=1,v1=x" },
  });
}

function checkoutEvent(
  session: Record<string, unknown>,
  type = "checkout.session.completed",
) {
  return {
    id: "evt_test_1",
    type,
    data: {
      object: {
        id: "cs_test_1",
        metadata: { user_id: "user-1" },
        customer: "cus_1",
        subscription: "sub_1",
        mode: "subscription",
        payment_status: "paid",
        ...session,
      },
    },
  };
}

function sub(status: string, price: string | string[], customer = "cus_1") {
  const prices = Array.isArray(price) ? price : [price];
  return {
    id: "sub_1",
    customer,
    status,
    items: { data: prices.map((id) => ({ price: { id } })) },
  };
}

const profileUpdates = () =>
  state.calls.filter((c) => c.table === "user_profiles" && c.op === "update");
const planWrites = () =>
  profileUpdates().filter((c) => c.payload && "plan" in c.payload);

beforeEach(() => {
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  state.calls = [];
  state.errorFor = () => null;
  state.dataFor = () => undefined;
  state.badSignature = false;
  state.lineItems = [];
  sentry.captureException.mockReset();
  sentry.captureMessage.mockReset();
  stripeApi.listLineItems
    .mockReset()
    .mockImplementation(async () => ({ data: state.lineItems }));
  stripeApi.retrieve
    .mockReset()
    .mockImplementation(async () => state.subscription);
});

describe("checkout.session.completed", () => {
  it("known subscription price + paid -> plan from the LIVE subscription", async () => {
    state.event = checkoutEvent({});
    state.lineItems = [{ price: { id: PRO } }];
    state.subscription = sub("active", PRO);
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(stripeApi.retrieve).toHaveBeenCalledWith("sub_1");
    const [w] = planWrites();
    expect(w.payload).toMatchObject({
      plan: "pro",
      stripe_subscription_id: "sub_1",
    });
    expect(w.filters).toContainEqual(["eq", "id", "user-1"]);
    expect(w.filters).toContainEqual(["neq", "plan", "lifetime"]);
    expect(state.calls[0]).toMatchObject({
      table: "stripe_events",
      op: "insert",
      payload: { id: "evt_test_1" },
    });
  });

  it("known one-time price (lifetime) + mode payment + paid -> lifetime", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: LIFETIME } }];
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(planWrites()[0].payload).toMatchObject({ plan: "lifetime" });
    expect(profileUpdates()[0].payload).toEqual({
      stripe_customer_id: "cus_1",
    });
    expect(stripeApi.retrieve).not.toHaveBeenCalled();
  });

  it("unknown price -> rejected, logged, never grants a plan", async () => {
    state.event = checkoutEvent({});
    state.lineItems = [{ price: { id: "price_attacker_cheap" } }];
    state.subscription = sub("active", "price_attacker_cheap");
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(planWrites()).toEqual([]);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("unknown price"),
      expect.objectContaining({
        tags: {
          stripe_event_id: "evt_test_1",
          stripe_event_type: "checkout.session.completed",
        },
      }),
    );
  });

  it("unpaid session -> no grant", async () => {
    state.event = checkoutEvent({
      mode: "payment",
      subscription: null,
      payment_status: "unpaid",
    });
    state.lineItems = [{ price: { id: LIFETIME } }];
    await POST(req());
    expect(planWrites()).toEqual([]);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("not paid"),
      expect.anything(),
    );
  });

  it("no_payment_required is accepted only for a subscription (trial), not a one-time plan", async () => {
    state.event = checkoutEvent({
      mode: "payment",
      subscription: null,
      payment_status: "no_payment_required",
    });
    state.lineItems = [{ price: { id: LIFETIME } }];
    await POST(req());
    expect(planWrites()).toEqual([]);

    state.calls = [];
    state.event = checkoutEvent({ payment_status: "no_payment_required" });
    state.lineItems = [{ price: { id: PRO_PLUS } }];
    state.subscription = sub("trialing", PRO_PLUS);
    await POST(req());
    expect(planWrites()[0].payload).toMatchObject({ plan: "pro_plus" });
  });

  it("mode that doesn't match the plan -> no grant", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: PRO } }];
    await POST(req());
    expect(planWrites()).toEqual([]);
  });

  it("client_reference_id alone is not trusted (metadata.user_id only) -> no grant", async () => {
    state.event = checkoutEvent({
      metadata: {},
      client_reference_id: "user-1",
    });
    state.lineItems = [{ price: { id: PRO } }];
    await POST(req());
    expect(planWrites()).toEqual([]);
  });
});

describe("customer.subscription.*", () => {
  it("re-fetches state: payload says active but Stripe says canceled -> downgrade, never re-grant", async () => {
    state.event = {
      id: "evt_late",
      type: "customer.subscription.updated",
      data: { object: { ...sub("active", PRO) } },
    };
    state.subscription = sub("canceled", PRO);
    const res = await POST(req());
    expect(res.status).toBe(200);
    const writes = planWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0].payload).toMatchObject({
      plan: "free",
      stripe_subscription_id: null,
    });
    expect(writes[0].filters).toContainEqual([
      "eq",
      "stripe_subscription_id",
      "sub_1",
    ]);
    expect(writes[0].filters).toContainEqual(["neq", "plan", "lifetime"]);
  });

  it("active with a known price -> plan by customer", async () => {
    state.event = {
      id: "evt_2",
      type: "customer.subscription.created",
      data: { object: { id: "sub_1" } },
    };
    state.subscription = sub("active", PRO_PLUS);
    await POST(req());
    const [w] = planWrites();
    expect(w.payload).toMatchObject({ plan: "pro_plus" });
    expect(w.filters).toContainEqual(["eq", "stripe_customer_id", "cus_1"]);
  });

  it("active with an unknown price -> rejected, no grant", async () => {
    state.event = {
      id: "evt_3",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    };
    state.subscription = sub("active", "price_unknown");
    await POST(req());
    expect(planWrites()).toEqual([]);
    expect(sentry.captureMessage).toHaveBeenCalled();
  });

  it("a one-time (lifetime) price on a subscription is not a recurring plan -> rejected", async () => {
    state.event = {
      id: "evt_4",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    };
    state.subscription = sub("active", LIFETIME);
    await POST(req());
    expect(planWrites()).toEqual([]);
  });
});

describe("idempotency, errors, signature", () => {
  it("duplicate event id -> 200 and skipped", async () => {
    state.event = checkoutEvent({});
    state.errorFor = (c) =>
      c.table === "stripe_events" && c.op === "insert"
        ? { code: "23505", message: "dup" }
        : null;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(stripeApi.listLineItems).not.toHaveBeenCalled();
    expect(profileUpdates()).toEqual([]);
  });

  it("stripe_events not migrated yet -> still processes", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: LIFETIME } }];
    state.errorFor = (c) =>
      c.table === "stripe_events"
        ? { code: "42P01", message: "missing" }
        : null;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(planWrites()[0].payload).toMatchObject({ plan: "lifetime" });
  });

  it("supabase error -> Sentry with event id/type, 500, claim released for Stripe's retry", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: LIFETIME } }];
    state.errorFor = (c) =>
      c.table === "user_profiles" ? { code: "42501", message: "denied" } : null;
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(sentry.captureException).toHaveBeenCalledWith(expect.anything(), {
      tags: {
        stripe_event_id: "evt_test_1",
        stripe_event_type: "checkout.session.completed",
      },
    });
    expect(state.calls).toContainEqual(
      expect.objectContaining({
        table: "stripe_events",
        op: "delete",
        filters: [["eq", "id", "evt_test_1"]],
      }),
    );
  });

  it("stripe_events insert failure (not dup/missing) -> 500 before any processing", async () => {
    state.event = checkoutEvent({});
    state.errorFor = (c) =>
      c.table === "stripe_events" ? { code: "08006", message: "conn" } : null;
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(stripeApi.listLineItems).not.toHaveBeenCalled();
  });

  it("bad signature -> 400, nothing touched", async () => {
    state.badSignature = true;
    const res = await POST(req());
    expect(res.status).toBe(400);
    expect(state.calls).toEqual([]);
  });

  it("every Supabase await in the route destructures { error }", () => {
    const src = readFileSync("app/api/billing/webhook/route.ts", "utf8");
    const lines = src.split("\n").filter((l) => /await\s+(db|q|s)\b/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const l of lines)
      expect(l).toMatch(
        /const \{ (data(: \w+)?, )?error(: \w+)? \} = await (db|q|s)\b/,
      );
  });
});

describe("Ren #255 nits", () => {
  it("customer already linked to another user -> rejected, Sentry, no grant", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: LIFETIME } }];
    state.dataFor = (c) =>
      c.op === "select" &&
      c.filters.some((f: any[]) => f[1] === "stripe_customer_id")
        ? [{ id: "someone-else" }]
        : undefined;
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(planWrites()).toEqual([]);
    expect(profileUpdates()).toEqual([]);
    expect(sentry.captureMessage).toHaveBeenCalledWith(
      expect.stringContaining("customer already linked to another user"),
      expect.anything(),
    );
  });

  it("user already linked to a different customer (guarded update matches 0 rows) -> no grant", async () => {
    state.event = checkoutEvent({ mode: "payment", subscription: null });
    state.lineItems = [{ price: { id: LIFETIME } }];
    state.dataFor = (c) => (c.op === "update" && c.returning ? [] : undefined);
    await POST(req());
    expect(planWrites()).toEqual([]);
    const link = profileUpdates()[0];
    expect(link.payload).toEqual({ stripe_customer_id: "cus_1" });
    expect(link.filters).toContainEqual([
      "or",
      "stripe_customer_id.is.null,stripe_customer_id.eq.cus_1",
    ]);
    expect(link.filters).toContainEqual(["eq", "id", "user-1"]);
  });

  it("add-on-first subscription: highest KNOWN recurring item wins, unknown add-on ignored", async () => {
    state.event = {
      id: "evt_addon",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    };
    state.subscription = sub("active", ["price_addon_unknown", PRO, PRO_PLUS]);
    await POST(req());
    expect(planWrites()[0].payload).toMatchObject({ plan: "pro_plus" });
  });

  it("Stripe API throw -> 500, Sentry, claim released", async () => {
    state.event = checkoutEvent({});
    stripeApi.listLineItems
      .mockReset()
      .mockRejectedValue(new Error("stripe down"));
    const res = await POST(req());
    expect(res.status).toBe(500);
    expect(sentry.captureException).toHaveBeenCalledWith(expect.any(Error), {
      tags: {
        stripe_event_id: "evt_test_1",
        stripe_event_type: "checkout.session.completed",
      },
    });
    expect(state.calls).toContainEqual(
      expect.objectContaining({
        table: "stripe_events",
        op: "delete",
        filters: [["eq", "id", "evt_test_1"]],
      }),
    );
    expect(planWrites()).toEqual([]);
  });

  it("checkout.session.async_payment_succeeded grants like a paid completion", async () => {
    state.event = checkoutEvent(
      { mode: "payment", subscription: null },
      "checkout.session.async_payment_succeeded",
    );
    state.lineItems = [{ price: { id: LIFETIME } }];
    await POST(req());
    expect(planWrites()[0].payload).toMatchObject({ plan: "lifetime" });
  });

  it("customer.subscription.created re-fetches and grants by customer", async () => {
    state.event = {
      id: "evt_created",
      type: "customer.subscription.created",
      data: { object: { id: "sub_1", status: "incomplete" } },
    };
    state.subscription = sub("active", PRO);
    await POST(req());
    expect(stripeApi.retrieve).toHaveBeenCalledWith("sub_1");
    const [w] = planWrites();
    expect(w.payload).toMatchObject({
      plan: "pro",
      stripe_subscription_id: "sub_1",
    });
    expect(w.filters).toContainEqual(["eq", "stripe_customer_id", "cus_1"]);
  });

  it("plan_started_at is stamped only where it is NULL, never overwritten", async () => {
    state.event = {
      id: "evt_stamp",
      type: "customer.subscription.updated",
      data: { object: { id: "sub_1" } },
    };
    state.subscription = sub("active", PRO);
    await POST(req());
    const stamps = profileUpdates().filter(
      (c) => c.payload && "plan_started_at" in c.payload,
    );
    expect(stamps).toHaveLength(1);
    expect(stamps[0].filters).toContainEqual(["is", "plan_started_at", null]);
    expect(stamps[0].filters).toContainEqual([
      "eq",
      "stripe_subscription_id",
      "sub_1",
    ]);
    // the plan write itself never touches plan_started_at
    expect(planWrites()[0].payload).not.toHaveProperty("plan_started_at");
  });

  it("checkout subscription whose live customer differs from the session customer -> no grant", async () => {
    state.event = checkoutEvent({});
    state.lineItems = [{ price: { id: PRO } }];
    state.subscription = sub("active", PRO, "cus_other");
    await POST(req());
    expect(planWrites()).toEqual([]);
  });
});
