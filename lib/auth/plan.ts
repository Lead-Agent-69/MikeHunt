// Legacy billing labels remain compatible; customer tools do not require payment.

import type { SupabaseClient } from "@supabase/supabase-js";

export type Plan =
  | "free"
  | "community"
  | "pro"
  | "pro_plus"
  | "elite"
  | "lifetime";

const PAID: Plan[] = ["pro", "pro_plus", "elite", "lifetime"];

export function isPaid(plan: Plan | string | null | undefined): boolean {
  return !!plan && PAID.includes(plan as Plan);
}

export function hasFullCustomerAccess(plan: Plan | string | null | undefined) {
  return plan === "free" || plan === "community" || isPaid(plan);
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
  if (isPaid(data?.plan)) return data?.plan as Plan;
  const { data: preference, error } = await supabase
    .from("user_preferences")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();
  return !error && preference?.prefs?.workspaceAccess === "community"
    ? "community"
    : "free";
}

export interface MeterResult {
  allowed: boolean;
  remaining: number; // Infinity for paid
  limit: number; // Infinity for paid
  plan: Plan;
}

/**
 * Retain best-effort view telemetry without paywalling customer tools.
 */
export async function meterDealView(
  supabase: SupabaseClient,
  userId: string,
  dealId: string,
  plan: Plan,
): Promise<MeterResult> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    await supabase
      .from("deal_views")
      .insert({ user_id: userId, deal_id: dealId, day: today });
  } catch {
    /* View logging must never prevent opening a listing. */
  }
  return { allowed: true, remaining: Infinity, limit: Infinity, plan };
}
