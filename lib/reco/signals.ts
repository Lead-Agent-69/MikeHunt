import type { SupabaseClient } from "@supabase/supabase-js";
import { titleClass } from "@/lib/discovery/categorize";
import type { SignalRow } from "@/lib/intelligence/affinity";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** How far back the ranker and prompt read raw signals. Matches the 90-day prune. */
export const SIGNAL_LOOKBACK_DAYS = 90;
/** Newest rows read per request. Bounded so a heavy user costs one small query. */
export const SIGNAL_READ_LIMIT = 1000;

const SIGNAL_COLS =
  "deal_id, kind, dwell_ms, make, model, year, price, body, state, source, title_class, facet, created_at";

const clip = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim() : "";
  return s ? s.slice(0, max) : null;
};

/** Compact, server-derived snapshot of a deal row. Never trusts client-sent attributes. */
export function dealSnapshot(d: Record<string, any> | null | undefined) {
  if (!d) return {};
  // Accepts raw deal rows (snake_case) and mapped Deal objects (camelCase).
  const year = Number(d.year);
  const price = Math.round(Number(d.ask_price ?? d.askPrice));
  const st = String(d.location_state ?? d.locationState ?? "")
    .trim()
    .toUpperCase();
  return {
    make: clip(d.make, 40),
    model: clip(d.model, 60),
    year: Number.isInteger(year) && year > 1900 && year < 2100 ? year : null,
    price: Number.isFinite(price) && price > 0 ? price : null,
    body: clip(d.body_class ?? d.bodyClass, 40),
    state: /^[A-Z]{2}$/.test(st) ? st : null,
    source: clip(d.source, 40),
    title_class: titleClass(d.condition),
  };
}

/** PostgREST / Postgres codes when the relation isn't in the schema. */
export function isMissingDealSignalsTable(
  error:
    | {
        code?: string;
        message?: string;
      }
    | null
    | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  const msg = String(error.message || "").toLowerCase();
  return (
    msg.includes("deal_signals") &&
    (msg.includes("does not exist") || msg.includes("could not find"))
  );
}

export type SignalsRead = {
  rows: SignalRow[];
  /**
   * false when the deal_signals relation is missing; true when the table exists
   * (even if this user has zero rows). Other read errors still fail soft to []
   * with available:true so a transient blip is not mistaken for "table missing".
   */
  available: boolean;
};

/** Read a user's recent signals, newest first. Missing table → { rows:[], available:false }. */
export async function readUserSignals(
  sb: SupabaseClient,
  userId: string,
  now: number = Date.now(),
): Promise<SignalsRead> {
  try {
    const since = new Date(
      now - SIGNAL_LOOKBACK_DAYS * 86_400_000,
    ).toISOString();
    const { data, error } = await sb
      .from("deal_signals")
      .select(SIGNAL_COLS)
      .eq("user_id", userId)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(SIGNAL_READ_LIMIT);
    if (isMissingDealSignalsTable(error)) {
      return { rows: [], available: false };
    }
    if (error || !Array.isArray(data)) return { rows: [], available: true };
    return { rows: data as SignalRow[], available: true };
  } catch {
    return { rows: [], available: true };
  }
}

/**
 * Server-side signal from an API the user already called (deal open, save). Best-effort: a missing
 * table or any error is swallowed, so the calling route never fails because of telemetry.
 */
export async function recordDealSignal(
  sb: SupabaseClient,
  userId: string | null | undefined,
  kind: "open" | "save" | "unsave",
  deal: Record<string, any> | null | undefined,
): Promise<void> {
  const dealId = typeof deal?.id === "string" ? deal.id : "";
  if (!userId || !UUID_RE.test(dealId)) return;
  try {
    const { error } = await sb.from("deal_signals").insert({
      user_id: userId,
      deal_id: dealId,
      kind,
      ...dealSnapshot(deal),
    });
    if (error) console.warn("[reco] signal not stored:", error.message);
  } catch {
    /* telemetry is best-effort */
  }
}
