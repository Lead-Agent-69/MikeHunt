// Dealer discovery system across all 50 states for DealerHunt
// All dealer data is derived from the real `dealers` table in Supabase
// (enriched by `deals` aggregates). No fictional dealers are returned.

import { createServerComponentClient } from "@/lib/supabase";

export interface Dealer {
  id: string;
  name: string;
  type:
    | "independent"
    | "auction"
    | "franchise"
    | "salvage"
    | "wholesale"
    | "parts";
  location: {
    address: string;
    city: string;
    state: string;
    zip: string;
    coordinates: [number, number]; // [lat, lon]
  };
  contact: {
    phone: string;
    email?: string;
    website?: string;
  };
  inventory: {
    totalDeals: number;
    avgPrice: number;
    priceRange: { min: number; max: number };
    popularMakes: string[];
    updateFrequency: string;
  };
  reputation: {
    rating: number; // 1-5
    reviews: number;
    yearsInBusiness: number;
    accreditations: string[];
  };
  business: {
    license: string;
    established: Date;
    employees: number;
    specialties: string[];
    services: string[];
  };
  sourcing: {
    sources: string[];
    transportAvailable: boolean;
    financingAvailable: boolean;
    inspectionAvailable: boolean;
  };
  metrics: {
    dealScore: number; // 0-100
    profitPotential: number;
    reliabilityScore: number;
    responsivenessScore: number;
  };
  lastUpdated: Date;
}

export interface DealerSearchCriteria {
  states?: string[];
  dealerTypes?: Dealer["type"][];
  priceRange?: { min: number; max: number };
  makes?: string[];
  services?: string[];
  minRating?: number;
  maxDistance?: number; // miles from coordinates
  centerCoordinates?: [number, number];
  hasInventory?: boolean;
  sortBy?: "score" | "price" | "distance" | "rating";
  limit?: number;
}

// Map a row from the `dealers` table (enriched with `deals` aggregates) into a Dealer.
type DealerRow = {
  id: string;
  name: string;
  type: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  active_deals: number | null;
  avg_ask_price: number | null;
  avg_mmr_value: number | null;
  avg_profit_estimate: number | null;
  deal_score: number | null;
  verified: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  last_scraped_at: string | null;
};

type DealAgg = {
  count: number;
  prices: number[];
  makes: Record<string, number>;
  sources: Set<string>;
};

export class DealerDiscoveryEngine {
  private getClient() {
    return createServerComponentClient();
  }

  // Build per-dealer aggregates from the real `deals` table.
  private async aggregateDeals(
    dealerIds: string[],
  ): Promise<Map<string, DealAgg>> {
    const map = new Map<string, DealAgg>();
    if (dealerIds.length === 0) return map;

    const supabase = this.getClient();
    const { data, error } = await supabase
      .from("deals")
      .select("dealer_id, ask_price, make, source")
      .in("dealer_id", dealerIds)
      .eq("active", true);

    if (error || !data) return map;

    for (const row of data as any[]) {
      const id = row.dealer_id as string | null;
      if (!id) continue;
      let agg = map.get(id);
      if (!agg) {
        agg = { count: 0, prices: [], makes: {}, sources: new Set() };
        map.set(id, agg);
      }
      agg.count += 1;
      if (typeof row.ask_price === "number") agg.prices.push(row.ask_price);
      if (row.make) agg.makes[row.make] = (agg.makes[row.make] || 0) + 1;
      if (row.source) agg.sources.add(row.source);
    }
    return map;
  }

  // Convert a DB dealer row into the Dealer shape.
  private rowToDealer(row: DealerRow, agg?: DealAgg): Dealer {
    const prices = agg?.prices ?? [];
    const totalDeals = agg?.count ?? row.active_deals ?? 0;
    const avgPrice =
      prices.length > 0
        ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length)
        : Math.round(row.avg_ask_price ?? 0);
    const priceRange =
      prices.length > 0
        ? { min: Math.min(...prices), max: Math.max(...prices) }
        : { min: 0, max: 0 };
    const popularMakes = agg
      ? Object.entries(agg.makes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([m]) => m)
      : [];
    const sources = agg ? Array.from(agg.sources) : [];

    const validTypes: Dealer["type"][] = [
      "independent",
      "auction",
      "franchise",
      "salvage",
      "wholesale",
      "parts",
    ];
    const type: Dealer["type"] = validTypes.includes(row.type as Dealer["type"])
      ? (row.type as Dealer["type"])
      : "independent";

    const dealScore = Math.max(
      0,
      Math.min(100, Math.round(row.deal_score ?? 0)),
    );
    // Profit potential derived from real aggregates only.
    const profitPotential = Math.round(
      ((row.avg_profit_estimate ?? 0) * totalDeals) / 1000,
    );

    return {
      id: row.id,
      name: row.name,
      type,
      location: {
        address: row.address ?? "",
        city: row.city ?? "",
        state: row.state ?? "",
        zip: row.zip ?? "",
        coordinates: [row.lat ?? 0, row.lng ?? 0],
      },
      contact: {
        phone: row.phone ?? "",
        email: row.email ?? undefined,
        website: row.website ?? undefined,
      },
      inventory: {
        totalDeals,
        avgPrice,
        priceRange,
        popularMakes,
        updateFrequency: row.last_scraped_at ? "tracked" : "unknown",
      },
      reputation: {
        // We do not have real reputation data — report honestly as zeroed.
        rating: 0,
        reviews: 0,
        yearsInBusiness: 0,
        accreditations: row.verified ? ["Verified"] : [],
      },
      business: {
        license: "",
        established: row.created_at ? new Date(row.created_at) : new Date(0),
        employees: 0,
        specialties: [],
        services: [],
      },
      sourcing: {
        sources,
        transportAvailable: false,
        financingAvailable: false,
        inspectionAvailable: false,
      },
      metrics: {
        dealScore,
        profitPotential,
        reliabilityScore: dealScore,
        responsivenessScore: 0,
      },
      lastUpdated: row.updated_at ? new Date(row.updated_at) : new Date(),
    };
  }

  // Search for dealers based on criteria — backed by the real `dealers` table.
  async searchDealers(criteria: DealerSearchCriteria): Promise<Dealer[]> {
    const supabase = this.getClient();

    let query = supabase.from("dealers").select("*");

    if (criteria.states && criteria.states.length > 0) {
      query = query.in("state", criteria.states);
    }
    if (criteria.dealerTypes && criteria.dealerTypes.length > 0) {
      query = query.in("type", criteria.dealerTypes as string[]);
    }
    if (criteria.priceRange) {
      query = query
        .gte("avg_ask_price", criteria.priceRange.min)
        .lte("avg_ask_price", criteria.priceRange.max);
    }
    if (criteria.hasInventory === true) {
      query = query.gt("active_deals", 0);
    } else if (criteria.hasInventory === false) {
      query = query.eq("active_deals", 0);
    }

    const { data, error } = await query.limit(
      criteria.limit ? Math.min(criteria.limit * 5, 500) : 500,
    );
    if (error || !data || data.length === 0) return [];

    const rows = data as unknown as DealerRow[];
    const aggs = await this.aggregateDeals(rows.map((r) => r.id));
    let dealers = rows.map((r) => this.rowToDealer(r, aggs.get(r.id)));

    // Filter by makes (derived from real deal aggregates).
    if (criteria.makes && criteria.makes.length > 0) {
      dealers = dealers.filter((d) =>
        criteria.makes!.some((make) => d.inventory.popularMakes.includes(make)),
      );
    }

    // Distance filter using real coordinates.
    if (criteria.centerCoordinates && criteria.maxDistance) {
      dealers = dealers.filter((d) => {
        if (d.location.coordinates[0] === 0 && d.location.coordinates[1] === 0)
          return false;
        return (
          this.calculateDistance(
            criteria.centerCoordinates!,
            d.location.coordinates,
          ) <= criteria.maxDistance!
        );
      });
    }

    // minRating cannot be satisfied with real data (no reputation source) — apply only if 0.
    if (criteria.minRating && criteria.minRating > 0) {
      dealers = dealers.filter(
        (d) => d.reputation.rating >= criteria.minRating!,
      );
    }

    if (criteria.sortBy) {
      dealers = this.sortDealers(
        dealers,
        criteria.sortBy,
        criteria.centerCoordinates,
      );
    }
    if (criteria.limit) {
      dealers = dealers.slice(0, criteria.limit);
    }
    return dealers;
  }

  // Calculate distance between two coordinates (Haversine, miles)
  private calculateDistance(
    coord1: [number, number],
    coord2: [number, number],
  ): number {
    const [lat1, lon1] = coord1;
    const [lat2, lon2] = coord2;
    const R = 3959; // Earth's radius in miles
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return degrees * (Math.PI / 180);
  }

  private sortDealers(
    dealers: Dealer[],
    sortBy: string,
    center?: [number, number],
  ): Dealer[] {
    switch (sortBy) {
      case "score":
        return dealers.sort(
          (a, b) => b.metrics.dealScore - a.metrics.dealScore,
        );
      case "price":
        return dealers.sort(
          (a, b) => a.inventory.avgPrice - b.inventory.avgPrice,
        );
      case "rating":
        return dealers.sort(
          (a, b) => b.reputation.rating - a.reputation.rating,
        );
      case "distance":
        if (center) {
          return dealers.sort(
            (a, b) =>
              this.calculateDistance(center, a.location.coordinates) -
              this.calculateDistance(center, b.location.coordinates),
          );
        }
        return dealers.sort(
          (a, b) => b.metrics.dealScore - a.metrics.dealScore,
        );
      default:
        return dealers;
    }
  }

  // Dealer statistics for a given state, computed from the real `dealers`/`deals` tables.
  async getStateDealerStats(state: string): Promise<{
    totalDealers: number;
    byType: Record<Dealer["type"], number>;
    avgPrice: number;
    avgRating: number;
    topMakes: string[];
  }> {
    const supabase = this.getClient();
    const st = state.toUpperCase();

    const { data: dealerRows } = await supabase
      .from("dealers")
      .select("id, type, avg_ask_price")
      .eq("state", st);

    const byType: Record<Dealer["type"], number> = {
      independent: 0,
      auction: 0,
      franchise: 0,
      salvage: 0,
      wholesale: 0,
      parts: 0,
    };
    let priceSum = 0;
    let priceCount = 0;
    for (const row of (dealerRows ?? []) as any[]) {
      const t = row.type as Dealer["type"];
      if (t in byType) byType[t] += 1;
      if (typeof row.avg_ask_price === "number" && row.avg_ask_price > 0) {
        priceSum += row.avg_ask_price;
        priceCount += 1;
      }
    }

    // Top makes from real deals in this state.
    const { data: dealRows } = await supabase
      .from("deals")
      .select("make")
      .eq("location_state", st)
      .eq("active", true)
      .limit(1000);

    const makeCounts: Record<string, number> = {};
    for (const row of (dealRows ?? []) as any[]) {
      if (row.make) makeCounts[row.make] = (makeCounts[row.make] || 0) + 1;
    }
    const topMakes = Object.entries(makeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([make]) => make);

    return {
      totalDealers: (dealerRows ?? []).length,
      byType,
      avgPrice: priceCount > 0 ? Math.round(priceSum / priceCount) : 0,
      avgRating: 0, // no real reputation data source
      topMakes,
    };
  }

  // Top dealers by (real) profit potential.
  async getTopDealersByProfit(limit: number = 10): Promise<Dealer[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from("dealers")
      .select("*")
      .order("avg_profit_estimate", { ascending: false, nullsFirst: false })
      .limit(Math.max(limit, 1));

    if (error || !data || data.length === 0) return [];
    const rows = data as unknown as DealerRow[];
    const aggs = await this.aggregateDeals(rows.map((r) => r.id));
    return rows
      .map((r) => this.rowToDealer(r, aggs.get(r.id)))
      .sort((a, b) => b.metrics.profitPotential - a.metrics.profitPotential)
      .slice(0, limit);
  }

  // Dealers near coordinates, using real lat/lng from the `dealers` table.
  async getDealersNearCoordinates(
    coordinates: [number, number],
    radius: number = 100,
    limit: number = 20,
  ): Promise<Dealer[]> {
    const supabase = this.getClient();
    const { data, error } = await supabase
      .from("dealers")
      .select("*")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .limit(500);

    if (error || !data || data.length === 0) return [];
    const rows = data as unknown as DealerRow[];
    const aggs = await this.aggregateDeals(rows.map((r) => r.id));

    return rows
      .map((r) => this.rowToDealer(r, aggs.get(r.id)))
      .filter(
        (d) =>
          this.calculateDistance(coordinates, d.location.coordinates) <= radius,
      )
      .sort(
        (a, b) =>
          this.calculateDistance(coordinates, a.location.coordinates) -
          this.calculateDistance(coordinates, b.location.coordinates),
      )
      .slice(0, limit);
  }

  // Dealer recommendations based on preferences — backed by real data.
  async generateDealerRecommendations(userPreferences: {
    preferredMakes: string[];
    priceRange: { min: number; max: number };
    location: { state: string; city?: string };
    services: string[];
  }): Promise<{
    recommended: Dealer[];
    reasoning: string[];
  }> {
    const criteria: DealerSearchCriteria = {
      states: [userPreferences.location.state],
      makes: userPreferences.preferredMakes,
      priceRange: userPreferences.priceRange,
      sortBy: "score",
      limit: 10,
    };

    let recommended = await this.searchDealers(criteria);
    const reasoning: string[] = [];

    if (recommended.length > 0) {
      reasoning.push(
        `Found ${recommended.length} dealers matching your criteria in ${userPreferences.location.state}`,
      );
      if (userPreferences.preferredMakes.length > 0) {
        reasoning.push(
          `Filtered for dealers with inventory in ${userPreferences.preferredMakes.join(", ")}`,
        );
      }
    } else {
      reasoning.push(
        "No matches found in your state — showing top dealers nationwide",
      );
      recommended = await this.getTopDealersByProfit(5);
    }

    return { recommended, reasoning };
  }
}
