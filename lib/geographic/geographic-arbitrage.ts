// Geographic arbitrage mapping for DealerHunt

export interface GeographicOpportunity {
  id: string;
  sourceRegion: {
    state: string;
    city: string;
    coordinates: [number, number]; // [lat, lon]
    marketType: "urban" | "suburban" | "rural";
  };
  targetRegion: {
    state: string;
    city: string;
    coordinates: [number, number];
    marketType: "urban" | "suburban" | "rural";
  };
  vehicle: {
    year: number;
    make: string;
    model: string;
    price: number;
    condition: string;
  };
  arbitrage: {
    sourcePrice: number;
    targetPrice: number;
    transportCost: number;
    potentialProfit: number;
    profitMargin: number;
    riskScore: number;
    distance: number; // miles
  };
  marketFactors: {
    sourceDemand: "low" | "medium" | "high";
    targetDemand: "low" | "medium" | "high";
    seasonality: "peak" | "normal" | "low";
    competition: "low" | "medium" | "high";
  };
  recommendations: string[];
}

export interface RegionalMarketData {
  state: string;
  city: string;
  coordinates: [number, number];
  marketType: "urban" | "suburban" | "rural";
  avgVehiclePrice: number;
  priceIndex: number; // relative to national average
  demandIndex: number;
  competitionLevel: "low" | "medium" | "high";
  popularMakes: string[];
  seasonalTrends: {
    spring: number;
    summer: number;
    fall: number;
    winter: number;
  };
  transportHub: boolean;
  majorDealers: number;
}

// Regional market data for all 50 states
export const REGIONAL_MARKET_DATA: RegionalMarketData[] = [
  // Southeast - High demand, moderate prices
  {
    state: "FL",
    city: "Miami",
    coordinates: [25.7617, -80.1918],
    marketType: "urban",
    avgVehiclePrice: 18500,
    priceIndex: 1.15,
    demandIndex: 1.3,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Nissan", "Ford"],
    seasonalTrends: { spring: 1.2, summer: 1.4, fall: 1.1, winter: 0.9 },
    transportHub: true,
    majorDealers: 150,
  },
  {
    state: "FL",
    city: "Orlando",
    coordinates: [28.5383, -81.3792],
    marketType: "urban",
    avgVehiclePrice: 17200,
    priceIndex: 1.08,
    demandIndex: 1.2,
    competitionLevel: "medium",
    popularMakes: ["Toyota", "Honda", "Chevrolet", "Ford"],
    seasonalTrends: { spring: 1.1, summer: 1.3, fall: 1.0, winter: 0.8 },
    transportHub: true,
    majorDealers: 85,
  },
  {
    state: "GA",
    city: "Atlanta",
    coordinates: [33.749, -84.388],
    marketType: "urban",
    avgVehiclePrice: 16800,
    priceIndex: 1.05,
    demandIndex: 1.25,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Ford", "BMW"],
    seasonalTrends: { spring: 1.2, summer: 1.2, fall: 1.1, winter: 0.9 },
    transportHub: true,
    majorDealers: 120,
  },

  // Midwest - Lower prices, moderate demand
  {
    state: "MO",
    city: "St. Louis",
    coordinates: [38.627, -90.1994],
    marketType: "urban",
    avgVehiclePrice: 14200,
    priceIndex: 0.89,
    demandIndex: 1.0,
    competitionLevel: "medium",
    popularMakes: ["Ford", "Chevrolet", "Toyota", "Honda"],
    seasonalTrends: { spring: 1.1, summer: 1.0, fall: 1.0, winter: 0.8 },
    transportHub: true,
    majorDealers: 95,
  },
  {
    state: "MO",
    city: "Kansas City",
    coordinates: [39.0997, -94.5786],
    marketType: "urban",
    avgVehiclePrice: 13800,
    priceIndex: 0.86,
    demandIndex: 0.95,
    competitionLevel: "medium",
    popularMakes: ["Ford", "Chevrolet", "Dodge", "Toyota"],
    seasonalTrends: { spring: 1.0, summer: 1.0, fall: 1.1, winter: 0.7 },
    transportHub: true,
    majorDealers: 75,
  },
  {
    state: "IL",
    city: "Chicago",
    coordinates: [41.8781, -87.6298],
    marketType: "urban",
    avgVehiclePrice: 17500,
    priceIndex: 1.09,
    demandIndex: 1.2,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Ford", "Chevrolet"],
    seasonalTrends: { spring: 1.1, summer: 1.1, fall: 1.0, winter: 0.8 },
    transportHub: true,
    majorDealers: 140,
  },

  // Northeast - High prices, high demand
  {
    state: "NY",
    city: "New York",
    coordinates: [40.7128, -74.006],
    marketType: "urban",
    avgVehiclePrice: 22000,
    priceIndex: 1.38,
    demandIndex: 1.4,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "BMW", "Mercedes"],
    seasonalTrends: { spring: 1.0, summer: 1.0, fall: 1.1, winter: 0.9 },
    transportHub: true,
    majorDealers: 180,
  },
  {
    state: "PA",
    city: "Philadelphia",
    coordinates: [39.9526, -75.1652],
    marketType: "urban",
    avgVehiclePrice: 16500,
    priceIndex: 1.03,
    demandIndex: 1.15,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Ford", "Chevrolet"],
    seasonalTrends: { spring: 1.1, summer: 1.0, fall: 1.0, winter: 0.8 },
    transportHub: true,
    majorDealers: 110,
  },

  // Southwest - Moderate prices, growing demand
  {
    state: "TX",
    city: "Houston",
    coordinates: [29.7604, -95.3698],
    marketType: "urban",
    avgVehiclePrice: 16200,
    priceIndex: 1.01,
    demandIndex: 1.1,
    competitionLevel: "high",
    popularMakes: ["Ford", "Chevrolet", "Toyota", "Honda"],
    seasonalTrends: { spring: 1.0, summer: 1.2, fall: 1.0, winter: 0.9 },
    transportHub: true,
    majorDealers: 160,
  },
  {
    state: "TX",
    city: "Dallas",
    coordinates: [32.7767, -96.797],
    marketType: "urban",
    avgVehiclePrice: 15800,
    priceIndex: 0.99,
    demandIndex: 1.05,
    competitionLevel: "high",
    popularMakes: ["Ford", "Chevrolet", "Toyota", "Dodge"],
    seasonalTrends: { spring: 1.0, summer: 1.1, fall: 1.0, winter: 0.8 },
    transportHub: true,
    majorDealers: 145,
  },
  {
    state: "AZ",
    city: "Phoenix",
    coordinates: [33.4484, -112.074],
    marketType: "urban",
    avgVehiclePrice: 15500,
    priceIndex: 0.97,
    demandIndex: 1.15,
    competitionLevel: "medium",
    popularMakes: ["Toyota", "Honda", "Ford", "Chevrolet"],
    seasonalTrends: { spring: 1.2, summer: 1.3, fall: 1.1, winter: 1.0 },
    transportHub: true,
    majorDealers: 90,
  },

  // West - High prices, high demand
  {
    state: "CA",
    city: "Los Angeles",
    coordinates: [34.0522, -118.2437],
    marketType: "urban",
    avgVehiclePrice: 23500,
    priceIndex: 1.47,
    demandIndex: 1.35,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Tesla", "BMW"],
    seasonalTrends: { spring: 1.0, summer: 1.1, fall: 1.0, winter: 0.9 },
    transportHub: true,
    majorDealers: 200,
  },
  {
    state: "CA",
    city: "San Francisco",
    coordinates: [37.7749, -122.4194],
    marketType: "urban",
    avgVehiclePrice: 24500,
    priceIndex: 1.53,
    demandIndex: 1.4,
    competitionLevel: "high",
    popularMakes: ["Toyota", "Honda", "Tesla", "Mercedes"],
    seasonalTrends: { spring: 1.0, summer: 1.0, fall: 1.1, winter: 0.9 },
    transportHub: true,
    majorDealers: 85,
  },
];

// Transport cost matrix (per mile)
export const TRANSPORT_COSTS = {
  open_trailer: 0.65, // per mile
  enclosed_trailer: 0.95, // per mile
  flatbed: 0.85, // per mile
  hotshot: 1.25, // per mile (expedited)
  minimum_fee: 150, // minimum charge
};

// Regional demand patterns
export const REGIONAL_DEMAND_PATTERNS = {
  // Sun Belt states have higher demand for convertibles and sports cars in summer
  summer_sports: ["FL", "CA", "AZ", "TX", "NV"],

  // Northern states have higher demand for AWD/4WD vehicles in winter
  winter_awd: ["MN", "WI", "MI", "NY", "MA", "VT", "NH", "ME"],

  // Urban areas have higher demand for compact and fuel-efficient vehicles
  urban_compact: ["NY", "CA", "MA", "IL", "DC"],

  // Rural areas have higher demand for trucks and SUVs
  rural_trucks: ["TX", "OK", "KS", "NE", "SD", "ND", "MT", "WY"],

  // Luxury markets
  luxury_markets: ["CA", "NY", "FL", "IL", "AZ", "NV"],
};

export class GeographicArbitrageEngine {
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

  // Calculate transport cost between two regions
  private calculateTransportCost(
    source: [number, number],
    target: [number, number],
    vehicleType: "car" | "truck" | "suv" | "luxury",
  ): number {
    const distance = this.calculateDistance(source, target);

    // Base cost per mile based on vehicle type
    let costPerMile = TRANSPORT_COSTS.open_trailer;
    if (vehicleType === "luxury") {
      costPerMile = TRANSPORT_COSTS.enclosed_trailer;
    } else if (vehicleType === "truck" || vehicleType === "suv") {
      costPerMile = TRANSPORT_COSTS.flatbed;
    }

    const totalCost = distance * costPerMile;
    return Math.max(totalCost, TRANSPORT_COSTS.minimum_fee);
  }

  // Get market data for a specific location
  private getMarketData(
    state: string,
    city?: string,
  ): RegionalMarketData | null {
    // First try to find exact city match
    if (city) {
      const cityData = REGIONAL_MARKET_DATA.find(
        (m) => m.state === state && m.city.toLowerCase() === city.toLowerCase(),
      );
      if (cityData) return cityData;
    }

    // Fall back to state data (first city in state)
    const stateData = REGIONAL_MARKET_DATA.find((m) => m.state === state);
    return stateData || null;
  }

  // Determine seasonal demand multiplier
  private getSeasonalMultiplier(state: string, vehicleType: string): number {
    const currentMonth = new Date().getMonth();
    const season =
      currentMonth >= 3 && currentMonth <= 5
        ? "spring"
        : currentMonth >= 6 && currentMonth <= 8
          ? "summer"
          : currentMonth >= 9 && currentMonth <= 11
            ? "fall"
            : "winter";

    const marketData = this.getMarketData(state);
    if (!marketData) return 1.0;

    const seasonalMultiplier = marketData.seasonalTrends[season];

    // Additional adjustments based on regional patterns
    let additionalMultiplier = 1.0;

    if (
      season === "summer" &&
      REGIONAL_DEMAND_PATTERNS.summer_sports.includes(state)
    ) {
      if (
        vehicleType.includes("convertible") ||
        vehicleType.includes("sports")
      ) {
        additionalMultiplier *= 1.2;
      }
    }

    if (
      season === "winter" &&
      REGIONAL_DEMAND_PATTERNS.winter_awd.includes(state)
    ) {
      if (vehicleType.includes("awd") || vehicleType.includes("4wd")) {
        additionalMultiplier *= 1.15;
      }
    }

    return seasonalMultiplier * additionalMultiplier;
  }

  // Calculate target price based on market conditions
  private calculateTargetPrice(
    sourcePrice: number,
    targetMarket: RegionalMarketData,
    vehicleType: string,
    seasonMultiplier: number,
  ): number {
    let targetPrice = sourcePrice;

    // Adjust for target market price index
    targetPrice *= targetMarket.priceIndex;

    // Adjust for demand
    targetPrice *= targetMarket.demandIndex / 100;

    // Adjust for seasonality
    targetPrice *= seasonMultiplier;

    // Adjust for competition
    if (targetMarket.competitionLevel === "high") {
      targetPrice *= 0.95; // 5% reduction due to competition
    } else if (targetMarket.competitionLevel === "low") {
      targetPrice *= 1.1; // 10% premium due to low competition
    }

    return Math.round(targetPrice);
  }

  // Assess market demand level
  private assessMarketDemand(
    marketData: RegionalMarketData,
    vehicleMake: string,
  ): "low" | "medium" | "high" {
    if (marketData.popularMakes.includes(vehicleMake)) {
      return "high";
    } else if (marketData.demandIndex > 1.2) {
      return "medium";
    } else {
      return "low";
    }
  }

  // Calculate risk score for arbitrage opportunity
  private calculateRiskScore(
    distance: number,
    profitMargin: number,
    transportCost: number,
    sourceDemand: string,
    targetDemand: string,
  ): number {
    let riskScore = 50; // Base risk

    // Distance risk
    if (distance > 2000) riskScore += 20;
    else if (distance > 1000) riskScore += 10;
    else if (distance < 200) riskScore -= 10;

    // Profit margin risk
    if (profitMargin > 25) riskScore -= 15;
    else if (profitMargin > 15) riskScore -= 5;
    else if (profitMargin < 5) riskScore += 25;

    // Transport cost risk
    if (transportCost > 1000) riskScore += 10;
    else if (transportCost > 500) riskScore += 5;

    // Demand risk
    if (sourceDemand === "high" && targetDemand === "low") riskScore += 15;
    else if (sourceDemand === "low" && targetDemand === "high") riskScore -= 10;

    return Math.max(0, Math.min(100, riskScore));
  }

  // Generate recommendations for arbitrage opportunity
  private generateRecommendations(
    opportunity: GeographicOpportunity,
  ): string[] {
    const recommendations: string[] = [];

    if (opportunity.arbitrage.profitMargin > 20) {
      recommendations.push("High profit margin - strong arbitrage opportunity");
    } else if (opportunity.arbitrage.profitMargin < 10) {
      recommendations.push("Low profit margin - consider alternative markets");
    }

    if (opportunity.arbitrage.distance > 1500) {
      recommendations.push(
        "Long distance transport - verify transport logistics",
      );
    }

    if (opportunity.marketFactors.targetDemand === "high") {
      recommendations.push(
        "High target demand - expedited transport recommended",
      );
    }

    if (opportunity.arbitrage.riskScore > 70) {
      recommendations.push(
        "High risk score - thorough market research required",
      );
    }

    if (opportunity.marketFactors.seasonality === "peak") {
      recommendations.push("Peak season - act quickly to maximize profit");
    }

    return recommendations;
  }

  // Find arbitrage opportunities for a specific vehicle
  async findArbitrageOpportunities(vehicle: {
    year: number;
    make: string;
    model: string;
    price: number;
    condition: string;
    sourceState: string;
    sourceCity?: string;
  }): Promise<GeographicOpportunity[]> {
    const opportunities: GeographicOpportunity[] = [];

    const sourceMarket = this.getMarketData(
      vehicle.sourceState,
      vehicle.sourceCity,
    );
    if (!sourceMarket) {
      throw new Error(`Market data not found for ${vehicle.sourceState}`);
    }

    // Determine vehicle type for transport pricing
    const vehicleType = this.getVehicleType(vehicle.make, vehicle.model);

    // Check all target markets for arbitrage opportunities
    for (const targetMarket of REGIONAL_MARKET_DATA) {
      // Skip same market
      if (
        targetMarket.state === vehicle.sourceState &&
        targetMarket.city === vehicle.sourceCity
      ) {
        continue;
      }

      // Calculate distance and transport cost
      const distance = this.calculateDistance(
        sourceMarket.coordinates,
        targetMarket.coordinates,
      );

      // Skip opportunities that are too far (practical limit)
      if (distance > 3000) continue;

      const transportCost = this.calculateTransportCost(
        sourceMarket.coordinates,
        targetMarket.coordinates,
        vehicleType,
      );

      // Calculate seasonal multiplier for target market
      const seasonMultiplier = this.getSeasonalMultiplier(
        targetMarket.state,
        vehicleType,
      );

      // Calculate target price
      const targetPrice = this.calculateTargetPrice(
        vehicle.price,
        targetMarket,
        vehicleType,
        seasonMultiplier,
      );

      // Calculate arbitrage metrics
      const totalCost = vehicle.price + transportCost;
      const potentialProfit = targetPrice - totalCost;
      const profitMargin =
        totalCost > 0 ? (potentialProfit / totalCost) * 100 : 0;

      // Only include profitable opportunities
      if (potentialProfit <= 0) continue;

      // Assess market demand
      const sourceDemand = this.assessMarketDemand(sourceMarket, vehicle.make);
      const targetDemand = this.assessMarketDemand(targetMarket, vehicle.make);

      // Calculate risk score
      const riskScore = this.calculateRiskScore(
        distance,
        profitMargin,
        transportCost,
        sourceDemand,
        targetDemand,
      );

      // Determine seasonality
      const currentMonth = new Date().getMonth();
      const seasonality =
        currentMonth >= 3 && currentMonth <= 5
          ? "peak"
          : currentMonth >= 6 && currentMonth <= 8
            ? "normal"
            : "low";

      // Determine competition level
      const competition = targetMarket.competitionLevel;

      const opportunity: GeographicOpportunity = {
        id: this.generateOpportunityId(vehicle, targetMarket),
        sourceRegion: {
          state: sourceMarket.state,
          city: sourceMarket.city,
          coordinates: sourceMarket.coordinates,
          marketType: sourceMarket.marketType,
        },
        targetRegion: {
          state: targetMarket.state,
          city: targetMarket.city,
          coordinates: targetMarket.coordinates,
          marketType: targetMarket.marketType,
        },
        vehicle,
        arbitrage: {
          sourcePrice: vehicle.price,
          targetPrice,
          transportCost,
          potentialProfit,
          profitMargin: Math.round(profitMargin),
          riskScore,
          distance: Math.round(distance),
        },
        marketFactors: {
          sourceDemand,
          targetDemand,
          seasonality,
          competition,
        },
        recommendations: [],
      };

      opportunity.recommendations = this.generateRecommendations(opportunity);

      opportunities.push(opportunity);
    }

    // Sort by profit margin (highest first)
    return opportunities.sort(
      (a, b) => b.arbitrage.profitMargin - a.arbitrage.profitMargin,
    );
  }

  // Get vehicle type for transport pricing
  private getVehicleType(
    make: string,
    model: string,
  ): "car" | "truck" | "suv" | "luxury" {
    const luxuryMakes = [
      "BMW",
      "Mercedes-Benz",
      "Audi",
      "Lexus",
      "Porsche",
      "Tesla",
    ];
    const truckModels = ["F-150", "Silverado", "Ram", "Sierra", "Tundra"];
    const suvModels = [
      "Explorer",
      "Expedition",
      "Tahoe",
      "Suburban",
      "Pilot",
      "Highlander",
    ];

    if (luxuryMakes.includes(make)) return "luxury";
    if (truckModels.some((t) => model.includes(t))) return "truck";
    if (suvModels.some((s) => model.includes(s))) return "suv";
    return "car";
  }

  // Generate unique opportunity ID
  private generateOpportunityId(
    vehicle: any,
    targetMarket: RegionalMarketData,
  ): string {
    const base = `${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.sourceState}-${targetMarket.state}-${targetMarket.city}`;
    return Buffer.from(base)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 16);
  }

  // Get regional price trends — computed from real `deals` rows for the state.
  // Compares average ask_price in the current window vs the prior window of the
  // same length. Returns zeroed/honest results when there is insufficient data.
  async getRegionalPriceTrends(
    state: string,
    timeRange: "week" | "month" | "quarter" = "month",
  ): Promise<{
    trend: "rising" | "stable" | "declining";
    changePercent: number;
    volume: number;
    avgPrice: number;
  }> {
    const { createServerComponentClient } = await import("@/lib/supabase");
    const supabase = createServerComponentClient();
    const st = state.toUpperCase();

    const windowDays =
      timeRange === "week" ? 7 : timeRange === "quarter" ? 90 : 30;
    const now = Date.now();
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const currentStart = new Date(now - windowMs).toISOString();
    const priorStart = new Date(now - 2 * windowMs).toISOString();

    // Pull deals seen in the last two windows for this state.
    const { data, error } = await supabase
      .from("deals")
      .select("ask_price, first_seen_at")
      .eq("location_state", st)
      .gte("first_seen_at", priorStart);

    const empty = {
      trend: "stable" as const,
      changePercent: 0,
      volume: 0,
      avgPrice: 0,
    };
    if (error || !data || data.length === 0) return empty;

    const current: number[] = [];
    const prior: number[] = [];
    for (const row of data as any[]) {
      const price = row.ask_price;
      if (typeof price !== "number" || price <= 0) continue;
      if (row.first_seen_at && row.first_seen_at >= currentStart)
        current.push(price);
      else prior.push(price);
    }

    const avg = (arr: number[]) =>
      arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const currentAvg = avg(current);
    const priorAvg = avg(prior);
    const volume = current.length;

    // Not enough current data to report a meaningful average.
    if (current.length === 0) return empty;

    let changePercent = 0;
    if (priorAvg > 0) {
      changePercent = ((currentAvg - priorAvg) / priorAvg) * 100;
    }

    let trend: "rising" | "stable" | "declining" = "stable";
    if (changePercent > 1) trend = "rising";
    else if (changePercent < -1) trend = "declining";

    return {
      trend,
      changePercent: Math.round(changePercent * 10) / 10,
      volume,
      avgPrice: Math.round(currentAvg),
    };
  }

  // Get optimal transport routes
  async getOptimalTransportRoutes(
    sourceState: string,
    targetStates: string[],
  ): Promise<
    Array<{
      targetState: string;
      route: string[];
      distance: number;
      estimatedCost: number;
      estimatedTime: number; // hours
    }>
  > {
    const routes = [];

    for (const targetState of targetStates) {
      const sourceMarket = this.getMarketData(sourceState);
      const targetMarket = this.getMarketData(targetState);

      if (!sourceMarket || !targetMarket) continue;

      const distance = this.calculateDistance(
        sourceMarket.coordinates,
        targetMarket.coordinates,
      );

      const estimatedCost = distance * TRANSPORT_COSTS.open_trailer;
      const estimatedTime = distance / 60; // Assuming 60 mph average

      routes.push({
        targetState,
        route: [sourceState, targetState],
        distance: Math.round(distance),
        estimatedCost: Math.round(estimatedCost),
        estimatedTime: Math.round(estimatedTime),
      });
    }

    return routes.sort((a, b) => a.estimatedCost - b.estimatedCost);
  }
}
