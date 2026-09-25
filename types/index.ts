// DealerHunt shared types

export interface Deal {
  id?: string;
  source: string;
  source_deal_id?: string;
  source_url?: string;
  dealer_id?: string;
  title: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  vin?: string;
  ask_price: number;
  buy_now_price?: number;
  mileage?: number;
  condition?: string;
  damage_type?: string;
  location_city?: string;
  location_state?: string;
  location_zip?: string;
  images?: string[];
  description?: string;
  seller?: string;
  seller_type?: "dealer" | "auction" | "private";
  seller_phone?: string;
  seller_email?: string;
  auction_end?: string;
  bid_count?: number;
  transport_cost?: number;
  repair_estimate?: number;
  estimated_transport_cost?: number;
  estimated_repair_cost?: number;
  true_net_profit?: number;
  mmr_value?: number;
  profit_estimate?: number;
  profit_score?: number;
  ai_wholesale_estimate?: number;
  ai_retail_estimate?: number;
  ai_rationale?: string;
  is_arbitrage_opportunity?: boolean;
  scraped_at?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, unknown>;
}

export interface ScrapeResult {
  source: string;
  success: boolean;
  dealsFound: number;
  dealsSaved?: number;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface ScraperRun {
  id: string;
  source: string;
  source_id?: string;
  status: "running" | "success" | "error" | "completed";
  deals_found: number;
  deals_saved?: number;
  duration_ms?: number;
  error_message?: string;
  started_at?: string;
  completed_at?: string;
  created_at?: string;
}

export interface DealerProfile {
  id?: string;
  name: string;
  city?: string;
  state?: string;
  address?: string;
  zip?: string;
  phone?: string;
  email?: string;
  website?: string;
  type?: string;
  total_deals?: number;
  avg_price?: number;
  rating?: number;
  reviews?: number;
  coordinates?: [number, number];
  source_id?: string;
  sources?: string[];
  last_updated?: string;
  metadata?: Record<string, unknown>;
}

export interface GeographicRegion {
  name: string;
  states: string[];
  cities?: string[];
  zip_codes?: string[];
}
