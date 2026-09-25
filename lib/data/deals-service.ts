import { createServerComponentClient } from "@/lib/supabase";

export type Deal = {
  id: string;
  source: string;
  title: string;
  year: number;
  make: string;
  model: string;
  trim?: string;
  vin?: string;
  mileage?: number;
  condition: string;
  askPrice: number;
  buyNowPrice?: number;
  buy_now_price?: number;
  mmrValue?: number;
  profitEstimate: number;
  profitScore?: number;
  images: string[];
  locationCity?: string;
  locationState?: string;
  locationZip?: string;
  active: boolean;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
  sourceUrl: string;
  auctionEndAt?: Date;
  damageType?: string;
  seller?: string;
  sellerType?: "dealer" | "auction" | "private";
  // Seller contact extracted at scrape time (options.contact). Powers in-app Call/Text/Email so the
  // dealer doesn't have to leave for the original site to reach out.
  contact?: { phone?: string; email?: string; listingUrl?: string };
  repair_estimate?: number;
  transport_cost?: number;
  is_arbitrage_opportunity?: boolean;
  estimated_transport_cost?: number;
  estimated_repair_cost?: number;
  true_net_profit?: number;
  ai_wholesale_estimate?: number;
  ai_retail_estimate?: number;
  ai_rationale?: string;
  // Decision engine output (lib/scoring/deal-analyzer.ts)
  sellEstimate?: number;
  recommendedMaxBid?: number;
  dealVerdict?: "go" | "hold" | "pass";
  priceDropAmount?: number;
  priceDropDays?: number;
  dealAnalysis?: {
    roi?: number;
    profitMargin?: number;
    breakEvenDay?: number;
    sellBasis?: "comps" | "market" | "markup";
    transportMiles?: number | null;
    costs?: {
      acquisition: number;
      repair: number;
      transport: number;
      holding: number;
      selling: number;
      total: number;
    };
    scoreBreakdown?: Record<string, number>;
    warnings?: string[];
    recommendations?: string[];
  };
};

export type DealFilters = {
  source?: string[];
  make?: string[];
  condition?: string[];
  location?: string;
  minProfit?: number;
  minScore?: number;
  sortBy?:
    | "profitEstimate"
    | "profitScore"
    | "askPrice"
    | "year"
    | "mileage"
    | "lastSeenAt";
  sortOrder?: "asc" | "desc";
  limit?: number;
  offset?: number;
};

export class DealsService {
  private supabase = createServerComponentClient();

  private mapDbToDeal(row: any): Deal {
    return {
      id: row.id,
      source: row.source,
      title: row.title,
      year: row.year,
      make: row.make,
      model: row.model,
      trim: row.trim,
      vin: row.vin,
      mileage: row.mileage,
      condition: row.condition,
      askPrice: Number(row.ask_price || 0),
      buyNowPrice: row.buy_now_price ? Number(row.buy_now_price) : undefined,
      mmrValue: row.mmr_value ? Number(row.mmr_value) : undefined,
      profitEstimate: Number(row.profit_estimate || 0),
      profitScore: row.profit_score ? Number(row.profit_score) : undefined,
      images: row.images || [],
      locationCity: row.location_city,
      locationState: row.location_state,
      locationZip: row.location_zip,
      active: row.active ?? true,
      firstSeenAt: new Date(row.first_seen_at),
      lastSeenAt: new Date(row.last_seen_at),
      sourceUrl: row.source_url,
      auctionEndAt: row.auction_end_at
        ? new Date(row.auction_end_at)
        : undefined,
      damageType: row.damage_type,
      seller: row.seller,
      sellerType: row.seller_type,
      contact:
        row.options?.contact?.phone || row.options?.contact?.email
          ? {
              phone: row.options.contact.phone || undefined,
              email: row.options.contact.email || undefined,
              listingUrl: row.source_url || undefined,
            }
          : undefined,
      repair_estimate: row.repair_estimate
        ? Number(row.repair_estimate)
        : undefined,
      transport_cost: row.transport_cost
        ? Number(row.transport_cost)
        : undefined,
      is_arbitrage_opportunity: row.is_arbitrage_opportunity,
      estimated_transport_cost: row.estimated_transport_cost
        ? Number(row.estimated_transport_cost)
        : undefined,
      estimated_repair_cost: row.estimated_repair_cost
        ? Number(row.estimated_repair_cost)
        : undefined,
      true_net_profit: row.true_net_profit
        ? Number(row.true_net_profit)
        : undefined,
      ai_wholesale_estimate: row.ai_wholesale_estimate
        ? Number(row.ai_wholesale_estimate)
        : undefined,
      ai_retail_estimate: row.ai_retail_estimate
        ? Number(row.ai_retail_estimate)
        : undefined,
      ai_rationale: row.ai_rationale,
      sellEstimate:
        row.sell_estimate != null ? Number(row.sell_estimate) : undefined,
      recommendedMaxBid:
        row.recommended_max_bid != null
          ? Number(row.recommended_max_bid)
          : undefined,
      dealVerdict: row.deal_verdict || undefined,
      dealAnalysis: row.deal_analysis || undefined,
      priceDropAmount:
        row.price_drop_amount != null
          ? Number(row.price_drop_amount)
          : undefined,
      priceDropDays:
        row.price_drop_days != null ? Number(row.price_drop_days) : undefined,
    };
  }

  private buildQuery(filters: DealFilters = {}) {
    let query = this.supabase
      .from("deals")
      .select("*", { count: "exact" })
      .eq("active", true);

    if (filters.source?.length) {
      query = query.in("source", filters.source);
    }

    if (filters.make?.length) {
      query = query.in("make", filters.make);
    }

    if (filters.condition?.length) {
      query = query.in("condition", filters.condition);
    }

    if (filters.location) {
      query = query.or(
        `location_city.ilike.%${filters.location}%,location_state.ilike.%${filters.location}%`,
      );
    }

    if (filters.minProfit) {
      query = query.gte("profit_estimate", filters.minProfit);
    }

    if (filters.minScore) {
      query = query.gte("profit_score", filters.minScore);
    }

    const sortBy = filters.sortBy || "profitScore";
    const sortOrder = filters.sortOrder || "desc";
    const sortColumnMap: Record<string, string> = {
      profitEstimate: "profit_estimate",
      profitScore: "profit_score",
      askPrice: "ask_price",
      year: "year",
      mileage: "mileage",
      lastSeenAt: "last_seen_at",
    };
    query = query.order(sortColumnMap[sortBy], {
      ascending: sortOrder === "asc",
    });

    return query;
  }

  async getDeals(filters: DealFilters = {}): Promise<{
    deals: Deal[];
    total: number;
    hasMore: boolean;
  }> {
    let query = this.buildQuery(filters);

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    if (filters.offset) {
      query = query.range(
        filters.offset,
        filters.offset + (filters.limit || 20) - 1,
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to fetch deals: ${error.message}`);
    }

    const deals = (data || []).map(this.mapDbToDeal);
    const total = count || 0;
    const limit = filters.limit || 20;
    const offset = filters.offset || 0;
    const hasMore = offset + deals.length < total;

    return { deals, total, hasMore };
  }

  async searchDeals(
    searchTerm: string,
    filters: DealFilters = {},
  ): Promise<{
    deals: Deal[];
    total: number;
    hasMore: boolean;
  }> {
    let query = this.supabase
      .from("deals")
      .select("*", { count: "exact" })
      .eq("active", true)
      .or(
        `title.ilike.%${searchTerm}%,make.ilike.%${searchTerm}%,model.ilike.%${searchTerm}%,vin.ilike.%${searchTerm}%`,
      );

    if (filters.minProfit) {
      query = query.gte("profit_estimate", filters.minProfit);
    }

    if (filters.minScore) {
      query = query.gte("profit_score", filters.minScore);
    }

    query = query.order("profit_score", {
      ascending: false,
      nullsFirst: false,
    });

    if (filters.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error, count } = await query;

    if (error) {
      throw new Error(`Failed to search deals: ${error.message}`);
    }

    const deals = (data || []).map(this.mapDbToDeal);
    const total = count || 0;
    const hasMore = deals.length < total;

    return { deals, total, hasMore };
  }

  async getHotDeals(limit = 10): Promise<Deal[]> {
    const { data, error } = await this.supabase
      .from("deals")
      .select("*")
      .eq("active", true)
      .gte("profit_score", 70)
      .order("profit_score", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch hot deals: ${error.message}`);
    }

    return (data || []).map(this.mapDbToDeal);
  }

  async getDealById(id: string): Promise<Deal | null> {
    const { data, error } = await this.supabase
      .from("deals")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return null;
      throw new Error(`Failed to fetch deal: ${error.message}`);
    }

    return this.mapDbToDeal(data);
  }

  // Collect the DISTINCT non-null values of one column across ALL active deals. PostgREST caps a single
  // response at 1000 rows, so a plain select would only see the first 1000 of ~32k deals and silently
  // drop most filter values (measured: 54/212 makes). Page with .range() to scan the whole table.
  private async collectDistinctColumn(column: string): Promise<string[]> {
    const PAGE = 1000;
    const MAX_PAGES = 60; // safety bound (~60k rows)
    const seen = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await this.supabase
        .from("deals")
        .select(column)
        .eq("active", true)
        .not(column, "is", null)
        .order(column)
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(`Failed to fetch ${column}: ${error.message}`);
      const rows = (data || []) as unknown as Array<Record<string, unknown>>;
      for (const r of rows) {
        const v = r[column];
        // Sanity-drop extraction junk (bare symbols, pure years like "1953"): a real make/source always
        // has a letter and ≥2 chars. Safe — never drops a legitimate value.
        if (typeof v === "string" && v.length >= 2 && /[a-z]/i.test(v))
          seen.add(v.trim());
      }
      if (rows.length < PAGE) break; // last page
    }
    return Array.from(seen).sort();
  }

  async getAvailableSources(): Promise<string[]> {
    return this.collectDistinctColumn("source");
  }

  async getAvailableMakes(): Promise<string[]> {
    return this.collectDistinctColumn("make");
  }
}
