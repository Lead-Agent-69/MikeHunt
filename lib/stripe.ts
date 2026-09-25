// lib/stripe.ts
// Stripe billing — lazily initialized so the app runs fine without keys (the whole billing surface
// degrades to "not configured" until STRIPE_SECRET_KEY + price IDs are set).

import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  if (!_stripe) _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return _stripe;
}

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export interface Plan {
  id: string;
  name: string;
  priceId?: string;
  amount: number; // cents
  interval: "month" | "year" | null;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    amount: 0,
    interval: null,
    features: [
      "10 VIN lookups/day",
      "3 saved searches",
      "Basic filters",
      "GO/HOLD/PASS verdicts",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceId: process.env.STRIPE_PRO_MONTHLY_PRICE_ID,
    amount: 2900,
    interval: "month",
    features: [
      "Unlimited lookups",
      "Unlimited alerts",
      "Deal Check",
      "Price history + timing",
      "Calibration dashboard",
      "Deal IQ",
    ],
  },
  {
    id: "pro_plus",
    name: "Pro Plus",
    priceId: process.env.STRIPE_PRO_PLUS_MONTHLY_PRICE_ID,
    amount: 7900,
    interval: "month",
    features: [
      "Everything in Pro",
      "Bulk/fleet sourcing",
      "Parts intelligence",
      "Public API access",
      "Priority support",
    ],
  },
  {
    id: "lifetime",
    name: "Lifetime",
    priceId: process.env.STRIPE_LIFETIME_PRICE_ID,
    amount: 49900,
    interval: null,
    features: [
      "Everything, forever",
      "One-time payment",
      "All future features",
    ],
  },
];
