// Stripe price id -> paid plan, from the PLANS catalogue in lib/stripe.ts. Unconfigured price ids
// (env var unset -> priceId undefined) never match, so an unknown price can never grant a paid plan.
import { PLANS } from "@/lib/stripe";

export type PaidPlanId = "pro" | "pro_plus" | "lifetime";

export interface PaidPlanMatch {
  id: PaidPlanId;
  /** Recurring plans are sold via Checkout mode=subscription; one-time plans via mode=payment. */
  recurring: boolean;
}

const RANK: PaidPlanId[] = ["pro", "pro_plus", "lifetime"];

export function planForPrice(
  priceId: string | null | undefined,
): PaidPlanMatch | null {
  if (!priceId) return null;
  const plan = PLANS.find((p) => !!p.priceId && p.priceId === priceId);
  if (!plan || !RANK.includes(plan.id as PaidPlanId)) return null;
  return { id: plan.id as PaidPlanId, recurring: plan.interval !== null };
}

/** Highest-ranked plan among matches (a checkout session is single-plan in practice). */
export function highestPlan(plans: PaidPlanMatch[]): PaidPlanMatch | null {
  if (plans.length === 0) return null;
  return [...plans].sort((a, b) => RANK.indexOf(b.id) - RANK.indexOf(a.id))[0];
}
