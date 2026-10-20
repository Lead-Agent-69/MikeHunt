export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { internalError } from "@/lib/api/http-error";
import {
  createServerComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { getServerUser } from "@/lib/server-supabase";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { outcomePredictionSnapshot } from "@/lib/outcomes/snapshot";
import {
  sameOutcomeActuals,
  publicOutcome,
  uuid,
  validateOutcome,
  type LedgerRow,
} from "@/lib/outcomes/ledger";

async function write(req: NextRequest, updating: boolean) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (
    req.headers.get("x-outcome-owner") &&
    req.headers.get("x-outcome-owner") !== user.id
  )
    return NextResponse.json(
      { error: "Your account changed. Reload before saving." },
      { status: 409 },
    );
  if (!isSupabaseConfigured())
    return NextResponse.json(
      { error: "Database unavailable", configured: false },
      { status: 503 },
    );
  const rl = rateLimit(req, {
    key: "outcome-write",
    limit: 60,
    windowMs: 60000,
  });
  if (!rl.allowed) return tooManyRequests(rl);
  let body: Record<string, unknown>;
  try {
    const input = await req.json();
    if (!input || typeof input !== "object" || Array.isArray(input))
      throw new Error("body");
    body = input;
  } catch {
    return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
  }
  if (!uuid(body.id))
    return NextResponse.json(
      { error: "A valid record id is required for safe retries." },
      { status: 400 },
    );
  if (
    updating &&
    (typeof body.revision !== "number" ||
      !Number.isInteger(body.revision) ||
      body.revision < 0)
  )
    return NextResponse.json(
      { error: "Reload the current record before saving." },
      { status: 400 },
    );
  for (const key of ["deal_id", "inventory_id"] as const)
    if (body[key] != null && !uuid(body[key]))
      return NextResponse.json({ error: `Invalid ${key}.` }, { status: 400 });
  body.id = (body.id as string).toLowerCase();
  for (const key of ["deal_id", "inventory_id"] as const)
    if (typeof body[key] === "string") body[key] = body[key].toLowerCase();
  const validated = validateOutcome(body);
  if (!validated.valid)
    return NextResponse.json(
      { error: "Check the marked outcome fields.", fields: validated.errors },
      { status: 400 },
    );
  const sb = createServerComponentClient();
  const payload = validated.row;
  if (updating && !("actual_fees" in body)) delete payload.actual_fees;
  let existing: LedgerRow | null = null;
  if (updating) {
    const read = await sb
      .from("deal_outcomes")
      .select("*")
      .eq("id", body.id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (read.error) return internalError("outcomes-read", read.error);
    if (!read.data)
      return NextResponse.json(
        { error: "Outcome not found." },
        { status: 404 },
      );
    existing = read.data;
    if (existing!.deal_id || existing!.inventory_id) {
      payload.year = existing!.year;
      payload.make = existing!.make;
      payload.model = existing!.model;
    }
    for (const key of ["deal_id", "inventory_id"] as const)
      if (body[key] != null && body[key] !== existing![key])
        return NextResponse.json(
          { error: "The linked vehicle cannot be changed." },
          { status: 400 },
        );
    if (existing!.revision !== body.revision) {
      if (
        existing!.revision === Number(body.revision) + 1 &&
        sameOutcomeActuals(existing!, payload)
      )
        return NextResponse.json({
          success: true,
          outcome: publicOutcome(existing!),
          replayed: true,
        });
      return NextResponse.json(
        {
          error:
            "This outcome changed. Reload its saved version before saving again.",
          conflict: true,
        },
        { status: 409 },
      );
    }
  }
  // Vehicle identity and prediction snapshots come from the server, never editable actual-cost fields.
  let snapshot: Record<string, unknown> = {};
  if (!updating && body.inventory_id) {
    const inventory = await sb
      .from("inventory")
      .select("id,deal_id,year,make,model")
      .eq("id", body.inventory_id)
      .eq("dealer_id", user.id)
      .maybeSingle();
    if (inventory.error)
      return internalError("outcomes-inventory", inventory.error);
    if (!inventory.data)
      return NextResponse.json(
        { error: "Inventory item not found." },
        { status: 404 },
      );
    if (body.deal_id && body.deal_id !== inventory.data.deal_id)
      return NextResponse.json(
        { error: "The inventory item belongs to another listing." },
        { status: 400 },
      );
    body.deal_id = inventory.data.deal_id;
    snapshot = {
      year: inventory.data.year,
      make: inventory.data.make,
      model: inventory.data.model,
    };
  }
  if (!updating && body.deal_id) {
    try {
      const captured = await outcomePredictionSnapshot(sb, body.deal_id);
      if (!captured)
        return NextResponse.json(
          { error: "Listing not found." },
          { status: 404 },
        );
      // A historical sale is useful for cost history, but is not an out-of-sample prediction.
      snapshot =
        payload.sell_price != null
          ? { year: captured.year, make: captured.make, model: captured.model }
          : { ...snapshot, ...captured };
    } catch (error) {
      return internalError("outcomes-listing", error);
    }
  }

  const result = updating
    ? await sb
        .from("deal_outcomes")
        .update(payload)
        .eq("id", body.id)
        .eq("user_id", user.id)
        .eq("revision", body.revision)
        .select("*")
        .maybeSingle()
    : await sb
        .from("deal_outcomes")
        .insert({
          ...payload,
          ...snapshot,
          id: body.id,
          user_id: user.id,
          deal_id: body.deal_id ?? null,
          inventory_id: body.inventory_id ?? null,
        })
        .select("*")
        .single();
  if (result.error) {
    if (!updating && result.error.code === "23505") {
      const prior = await sb
        .from("deal_outcomes")
        .select("*")
        .eq("id", body.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (
        !prior.error &&
        prior.data &&
        prior.data.deal_id === (body.deal_id ?? null) &&
        prior.data.inventory_id === (body.inventory_id ?? null) &&
        sameOutcomeActuals(prior.data, { ...payload, ...snapshot })
      )
        return NextResponse.json({
          success: true,
          outcome: publicOutcome(prior.data),
          replayed: true,
        });
      return NextResponse.json(
        {
          error:
            "Record already exists with different values. Reload before saving.",
        },
        { status: 409 },
      );
    }
    if (result.error.code === "23514")
      return NextResponse.json(
        { error: "Check the actual costs and purchase/sale dates." },
        { status: 400 },
      );
    return internalError("outcomes-save", result.error);
  }
  if (!result.data)
    return NextResponse.json(
      { error: "The outcome changed. Reload before saving.", conflict: true },
      { status: 409 },
    );
  if (result.data.id !== body.id || result.data.user_id !== user.id)
    return NextResponse.json(
      { error: "Save was not confirmed. Reload the record before retrying." },
      { status: 502 },
    );
  return NextResponse.json({
    success: true,
    outcome: publicOutcome(result.data),
  });
}
export function POST(req: NextRequest) {
  return write(req, false);
}
export function PATCH(req: NextRequest) {
  return write(req, true);
}
export async function GET(req?: NextRequest) {
  const {
    data: { user },
  } = await getServerUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isSupabaseConfigured())
    return NextResponse.json({
      outcomes: [],
      ownerId: user.id,
      configured: false,
    });
  const dealId = req?.nextUrl.searchParams.get("dealId");
  if (dealId && !uuid(dealId))
    return NextResponse.json({ error: "Invalid listing id." }, { status: 400 });
  let query = createServerComponentClient()
    .from("deal_outcomes")
    .select("*")
    .eq("user_id", user.id);
  if (dealId) query = query.eq("deal_id", dealId);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) return internalError("outcomes-list", error);
  return NextResponse.json({
    outcomes: (data || []).map(publicOutcome),
    ownerId: user.id,
    evidenceBasis: "owner_reported",
    limit: 200,
  });
}
