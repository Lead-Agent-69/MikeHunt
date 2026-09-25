// Plan + usage gating. Stripe billing already sets user_profiles.plan; this is the read/enforce side
// that was missing — so free vs paid actually means something. Kept deliberately light: on a
// browse-heavy app a per-request scan counter would burn in seconds, so the metered unit is a
// "deal analysis" (opening a specific deal's full intel), which is the valuable action. Paid plans
// are unmetered; a free dealer gets FREE_DEAL_VIEWS_PER_DAY distinct deals/day.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan = "free" | "pro" | "pro_plus" | "elite" | "lifetime";

export const FREE_DEAL_VIEWS_PER_DAY = 10;

const PAID: Plan[] = ["pro", "pro_plus", "elite", "lifetime"];

export function isPaid(plan: Plan | string | null | undefined): boolean {
  return !!plan && PAID.includes(plan as Plan);
}

/** Read the dealer's plan (defaults to free). */
export async function getUserPlan(
  supabase: SupabaseClient,
  userId: string,
): Promise<Plan> {
  const { data } = await supabase
    .from("user_profiles")
    .select("plan")
    .eq("id", userId)
    .maybeSingle();
  return ((data?.plan as Plan) || "free") as Plan;
}

export interface MeterResult {
  allowed: boolean;
  remaining: number; // Infinity for paid
  limit: number; // Infinity for paid
  plan: Plan;
}

/**
 * Meter a deal-analysis view. Paid → always allowed. Free → up to FREE_DEAL_VIEWS_PER_DAY DISTINCT
 * deals per day (re-opening a deal already seen today is free). Backed by the deal_views table.
 */
export async function meterDealView(
  supabase: SupabaseClient,
  userId: string,
  dealId: string,
  plan: Plan,
): Promise<MeterResult> {
  if (isPaid(plan))
    return { allowed: true, remaining: Infinity, limit: Infinity, plan };

  const today = new Date().toISOString().slice(0, 10);

  // Already counted today? Re-viewing the same deal is free.
  const { data: existing } = await supabase
    .from("deal_views")
    .select("deal_id")
    .eq("user_id", userId)
    .eq("day", today)
    .eq("deal_id", dealId)
    .maybeSingle();

  const { count } = await supabase
    .from("deal_views")
    .select("deal_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("day", today);
  const used = count || 0;

  if (existing) {
    return {
      allowed: true,
      remaining: Math.max(0, FREE_DEAL_VIEWS_PER_DAY - used),
      limit: FREE_DEAL_VIEWS_PER_DAY,
      plan,
    };
  }
  if (used >= FREE_DEAL_VIEWS_PER_DAY) {
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_DEAL_VIEWS_PER_DAY,
      plan,
    };
  }
  // Count this new view (best-effort; a race at the boundary just allows one extra — acceptable).
  await supabase
    .from("deal_views")
    .insert({ user_id: userId, deal_id: dealId, day: today });
  return {
    allowed: true,
    remaining: FREE_DEAL_VIEWS_PER_DAY - used - 1,
    limit: FREE_DEAL_VIEWS_PER_DAY,
    plan,
  };
}
