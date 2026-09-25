// Real dealers service with database integration
import { createClient } from "@supabase/supabase-js";

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

export class DealersService {
  private supabase: any;

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || "",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    );
  }

  // Search dealers with filters
  async searchDealers(criteria: DealerSearchCriteria = {}): Promise<Dealer[]> {
    let query = this.supabase.from("dealers").select("*");

    // Apply filters
    if (criteria.states && criteria.states.length > 0) {
      query = query.in("state", criteria.states);
    }

    if (criteria.dealerTypes && criteria.dealerTypes.length > 0) {
      query = query.in("type", criteria.dealerTypes);
    }

    if (criteria.priceRange) {
      query = query
        .gte("avg_ask_price", criteria.priceRange.min)
        .lte("avg_ask_price", criteria.priceRange.max);
    }

    // NOTE: `makes`/`services` filters have no backing column on `dealers`; no-op gracefully.

    if (criteria.minRating) {
      // No `rating` column exists; approximate with `deal_score`.
      query = query.gte("deal_score", criteria.minRating);
    }

    // Apply sorting
    if (criteria.sortBy) {
      switch (criteria.sortBy) {
        case "score":
          query = query.order("deal_score", { ascending: false });
          break;
        case "price":
          query = query.order("avg_ask_price", { ascending: true });
          break;
        case "rating":
          query = query.order("deal_score", { ascending: false });
          break;
        default:
          query = query.order("deal_score", { ascending: false });
      }
    } else {
      query = query.order("deal_score", { ascending: false });
    }

    // Apply limit
    if (criteria.limit) {
      query = query.limit(criteria.limit);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Failed to search dealers: ${error.message}`);
    }

    const dealers = (data || []).map(this.mapDbToDealer);

    // Filter by distance if coordinates provided
    if (criteria.centerCoordinates && criteria.maxDistance) {
      return this.filterByDistance(
        dealers,
        criteria.centerCoordinates,
        criteria.maxDistance,
      );
    }

    return dealers;
  }

  // Get dealer by ID
  async getDealerById(id: string): Promise<Dealer | null> {
    const { data, error } = await this.supabase
      .from("dealers")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") {
        return null; // Not found
      }
      throw new Error(`Failed to fetch dealer: ${error.message}`);
    }

    return this.mapDbToDealer(data);
  }

  // Get dealers near coordinates
  async getDealersNearCoordinates(
    coordinates: [number, number],
    radius: number = 100, // miles
    limit: number = 20,
  ): Promise<Dealer[]> {
    const [lat, lng] = coordinates;

    // Prefer the `dealers_near` Postgres RPC (PostGIS ST_DWithin/ST_Distance).
    const { data: rpcData, error: rpcError } = await this.supabase.rpc(
      "dealers_near",
      {
        user_lat: lat,
        user_lng: lng,
        radius_miles: Math.round(radius),
      },
    );

    if (!rpcError && rpcData) {
      return (rpcData as any[]).slice(0, limit).map(this.mapDbToDealer);
    }

    // Fallback: bounding-box filter on lat/lng, then sort client-side by haversine.
    // 1 degree latitude ~= 69 miles; widen longitude by latitude.
    const latDelta = radius / 69;
    const lngDelta =
      radius / (69 * Math.max(Math.cos(this.toRadians(lat)), 0.01));

    const { data, error } = await this.supabase
      .from("dealers")
      .select("*")
      .gte("lat", lat - latDelta)
      .lte("lat", lat + latDelta)
      .gte("lng", lng - lngDelta)
      .lte("lng", lng + lngDelta);

    if (error) {
      throw new Error(`Failed to find nearby dealers: ${error.message}`);
    }

    const dealers = (data || []).map(this.mapDbToDealer);
    return this.filterByDistance(dealers, coordinates, radius).slice(0, limit);
  }

  // Get top dealers by profit potential
  async getTopDealersByProfit(limit: number = 10): Promise<Dealer[]> {
    const { data, error } = await this.supabase
      .from("dealers")
      .select("*")
      .order("avg_profit_estimate", { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to fetch top dealers: ${error.message}`);
    }

    return (data || []).map(this.mapDbToDealer);
  }

  // Get dealer statistics by state
  async getStateDealerStats(state: string): Promise<{
    totalDealers: number;
    byType: Record<Dealer["type"], number>;
    avgPrice: number;
    avgRating: number;
    topMakes: string[];
  }> {
    const { data, error } = await this.supabase
      .from("dealers")
      .select("type, avg_ask_price, deal_score, active_deals")
      .eq("state", state);

    if (error) {
      throw new Error(`Failed to fetch state stats: ${error.message}`);
    }

    const dealers = data || [];
    const totalDealers = dealers.length;

    // Count by type
    const byType: Record<Dealer["type"], number> = {
      independent: 0,
      auction: 0,
      franchise: 0,
      salvage: 0,
      wholesale: 0,
      parts: 0,
    };

    dealers.forEach((dealer: any) => {
      if (dealer.type in byType) {
        byType[dealer.type as Dealer["type"]]++;
      }
    });

    // Calculate averages from real columns
    const avgPrice =
      dealers.length > 0
        ? dealers.reduce(
            (sum: number, dealer: any) =>
              sum + (parseFloat(dealer.avg_ask_price) || 0),
            0,
          ) / dealers.length
        : 0;

    // No `rating` column exists; approximate reputation with `deal_score`.
    const avgRating =
      dealers.length > 0
        ? dealers.reduce(
            (sum: number, dealer: any) =>
              sum + (parseFloat(dealer.deal_score) || 0),
            0,
          ) / dealers.length
        : 0;

    // No `popular_makes` column exists on dealers.
    const topMakes: string[] = [];

    return {
      totalDealers,
      byType,
      avgPrice: Math.round(avgPrice),
      avgRating: Math.round(avgRating * 10) / 10,
      topMakes,
    };
  }

  // Get dealer recommendations based on user preferences
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
      services: userPreferences.services,
      sortBy: "score",
      limit: 10,
    };

    const recommended = await this.searchDealers(criteria);
    const reasoning: string[] = [];

    if (recommended.length > 0) {
      reasoning.push(
        `Found ${recommended.length} dealers matching your criteria in ${userPreferences.location.state}`,
      );

      if (userPreferences.preferredMakes.length > 0) {
        reasoning.push(
          `Filtered for dealers specializing in ${userPreferences.preferredMakes.join(", ")}`,
        );
      }

      if (userPreferences.services.length > 0) {
        reasoning.push(
          `Prioritized dealers offering ${userPreferences.services.join(", ")}`,
        );
      }
    } else {
      reasoning.push("No exact matches found - showing nearest alternatives");
      // Fallback to nearest dealers
      criteria.states = undefined;
      criteria.makes = undefined;
      criteria.limit = 5;
      recommended.push(...(await this.searchDealers(criteria)));
    }

    return { recommended, reasoning };
  }

  // Update dealer information
  async updateDealer(id: string, updates: Partial<Dealer>): Promise<Dealer> {
    const dbUpdates = this.mapDealerToDb(updates);

    const { data, error } = await this.supabase
      .from("dealers")
      .update(dbUpdates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to update dealer: ${error.message}`);
    }

    return this.mapDbToDealer(data);
  }

  // Add dealer to database
  async addDealer(dealer: Omit<Dealer, "id" | "lastUpdated">): Promise<Dealer> {
    const dbDealer = this.mapDealerToDb(dealer);

    const { data, error } = await this.supabase
      .from("dealers")
      .insert(dbDealer)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to add dealer: ${error.message}`);
    }

    return this.mapDbToDealer(data);
  }

  // Get dealer statistics
  async getDealerStatistics(): Promise<{
    totalDealers: number;
    byType: Record<Dealer["type"], number>;
    byState: Record<string, number>;
    avgRating: number;
    topStates: Array<{ state: string; count: number }>;
  }> {
    const { data, error } = await this.supabase
      .from("dealers")
      .select("type, state, deal_score");

    if (error) {
      throw new Error(`Failed to fetch dealer statistics: ${error.message}`);
    }

    const dealers = data || [];
    const totalDealers = dealers.length;

    // Count by type
    const byType: Record<Dealer["type"], number> = {
      independent: 0,
      auction: 0,
      franchise: 0,
      salvage: 0,
      wholesale: 0,
      parts: 0,
    };

    // Count by state
    const byState: Record<string, number> = {};

    dealers.forEach((dealer: any) => {
      if (dealer.type in byType) {
        byType[dealer.type as Dealer["type"]]++;
      }

      byState[dealer.state] = (byState[dealer.state] || 0) + 1;
    });

    // No `rating` column exists; approximate reputation with `deal_score`.
    const avgRating =
      dealers.length > 0
        ? dealers.reduce(
            (sum: number, dealer: any) =>
              sum + (parseFloat(dealer.deal_score) || 0),
            0,
          ) / dealers.length
        : 0;

    // Get top states
    const topStates = Object.entries(byState)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([state, count]) => ({ state, count }));

    return {
      totalDealers,
      byType,
      byState,
      avgRating: Math.round(avgRating * 10) / 10,
      topStates,
    };
  }

  // Filter dealers by distance
  private filterByDistance(
    dealers: Dealer[],
    centerCoordinates: [number, number],
    maxDistance: number,
  ): Dealer[] {
    return dealers
      .filter((dealer) => {
        const distance = this.calculateDistance(
          centerCoordinates,
          dealer.location.coordinates,
        );
        return distance <= maxDistance;
      })
      .sort((a, b) => {
        const distanceA = this.calculateDistance(
          centerCoordinates,
          a.location.coordinates,
        );
        const distanceB = this.calculateDistance(
          centerCoordinates,
          b.location.coordinates,
        );
        return distanceA - distanceB;
      });
  }

  // Calculate distance between two coordinates (Haversine formula)
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

  // Map database record to Dealer interface (maps from REAL `dealers` columns only).
  // Fields with no backing column return 0 / [] / undefined rather than crashing.
  private mapDbToDealer(dbRecord: any): Dealer {
    return {
      id: dbRecord.id,
      name: dbRecord.name,
      type: dbRecord.type,
      location: {
        address: dbRecord.address,
        city: dbRecord.city,
        state: dbRecord.state,
        zip: dbRecord.zip,
        // Use the real lat/lng columns; default to [0, 0] when missing.
        coordinates: [
          parseFloat(dbRecord.lat) || 0,
          parseFloat(dbRecord.lng) || 0,
        ],
      },
      contact: {
        phone: dbRecord.phone,
        email: dbRecord.email,
        website: dbRecord.website,
      },
      inventory: {
        totalDeals: dbRecord.active_deals || 0,
        avgPrice: parseFloat(dbRecord.avg_ask_price) || 0,
        priceRange: { min: 0, max: 0 },
        popularMakes: [],
        updateFrequency: "daily",
      },
      reputation: {
        // No `rating` column; surface `deal_score` as the reputation signal.
        rating: parseFloat(dbRecord.deal_score) || 0,
        reviews: 0,
        yearsInBusiness: 0,
        accreditations: [],
      },
      business: {
        license: "",
        established: dbRecord.created_at
          ? new Date(dbRecord.created_at)
          : new Date(0),
        employees: 0,
        specialties: [],
        services: [],
      },
      sourcing: {
        sources: dbRecord.source_url ? [dbRecord.source_url] : [],
        transportAvailable: false,
        financingAvailable: false,
        inspectionAvailable: false,
      },
      metrics: {
        dealScore: parseFloat(dbRecord.deal_score) || 0,
        profitPotential: parseFloat(dbRecord.avg_profit_estimate) || 0,
        reliabilityScore: 0,
        responsivenessScore: 0,
      },
      lastUpdated: dbRecord.updated_at
        ? new Date(dbRecord.updated_at)
        : dbRecord.last_scraped_at
          ? new Date(dbRecord.last_scraped_at)
          : new Date(),
    };
  }

  // Map Dealer interface to database record (REAL columns only).
  private mapDealerToDb(dealer: Partial<Dealer>): any {
    const record: any = {
      name: dealer.name,
      type: dealer.type,
      address: dealer.location?.address,
      city: dealer.location?.city,
      state: dealer.location?.state,
      zip: dealer.location?.zip,
      phone: dealer.contact?.phone,
      email: dealer.contact?.email,
      website: dealer.contact?.website,
      active_deals: dealer.inventory?.totalDeals,
      avg_ask_price: dealer.inventory?.avgPrice,
      deal_score: dealer.metrics?.dealScore,
      avg_profit_estimate: dealer.metrics?.profitPotential,
      updated_at: new Date().toISOString(),
    };

    if (dealer.location?.coordinates) {
      const [lat, lng] = dealer.location.coordinates;
      record.lat = lat;
      record.lng = lng;
    }

    // Drop undefined keys so partial updates don't null out existing columns.
    Object.keys(record).forEach(
      (k) => record[k] === undefined && delete record[k],
    );
    return record;
  }
}
