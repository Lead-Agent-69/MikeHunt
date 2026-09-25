// lib/scrapers/sync.ts
// Async mirror from 'deals' (primary) to 'vehicles' (North Star lean table) for dual support.
// Primary writes remain in deals (via upsertDeals). Call this after successful upserts.

import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  return createClient(supabaseUrl, supabaseKey);
}

export interface DealLike {
  id?: string;
  source?: string;
  source_deal_id?: string;
  source_url?: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  ask_price?: number;
  mileage?: number;
  condition?: string;
  damage_type?: string;
  location_city?: string;
  location_state?: string;
  location_zip?: string;
  images?: string[] | any;
  description?: string;
  seller?: string;
  seller_type?: string;
  auction_end?: string | Date;
  bid_count?: number;
  mmr_value?: number;
  market_value?: number;
  profit_estimate?: number;
  profit_score?: number;
  verdict?: string;
  transport_cost?: number;
  repair_estimate?: number;
  is_arbitrage_opportunity?: boolean;
  metadata?: Record<string, any>;
  scraped_at?: string;
}

export async function syncDealToVehicle(deal: DealLike): Promise<boolean> {
  // vehicles table is obsolete (renamed to deals).
  // Everything is stored directly in deals now.
  return true;
}

export async function syncDealsToVehicles(deals: DealLike[]): Promise<number> {
  let ok = 0;
  for (const d of deals) {
    if (await syncDealToVehicle(d)) ok++;
  }
  return ok;
}
