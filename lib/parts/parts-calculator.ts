// Parts sourcing and tear-down calculator for DealerHunt

import { damageEffect, damageSummary, type PartStatus } from "./damage-map";

export interface Part {
  id: string;
  name: string;
  category:
    | "engine"
    | "transmission"
    | "body"
    | "interior"
    | "electronics"
    | "suspension"
    | "brakes"
    | "wheels"
    | "other";
  condition: "new" | "used" | "remanufactured" | "salvage";
  price: number;
  estimatedValue: number;
  weight: number; // lbs
  removalDifficulty: "easy" | "moderate" | "difficult" | "expert";
  removalTime: number; // hours
  compatibility: string[]; // vehicle makes/models
  source: string;
  url?: string;
  notes?: string;
  // Damage-aware saleability: how this vehicle's damage affects this part.
  damageStatus?: PartStatus;
}

export interface TearDownAnalysis {
  vehicleId: string;
  vehicleInfo: {
    year: number;
    make: string;
    model: string;
    vin?: string;
    purchasePrice: number;
    condition: "clean" | "salvage" | "rebuilt" | "parts";
  };
  parts: Part[];
  summary: {
    totalPartValue: number;
    totalRemovalCost: number;
    totalLaborHours: number;
    netProfit: number;
    profitMargin: number;
    roi: number;
    breakEvenPoint: number;
    riskScore: number;
  };
  recommendations: string[];
}

export interface RepairEstimate {
  category: "mechanical" | "body" | "electrical" | "interior" | "safety";
  description: string;
  estimatedCost: number;
  estimatedHours: number;
  partsNeeded: string[];
  priority: "critical" | "high" | "medium" | "low";
  notes?: string;
}

// Parts database with realistic market values
export const PARTS_DATABASE = {
  // Engine components
  engine: [
    {
      name: "Engine Assembly",
      avgValue: 3500,
      weight: 350,
      removalTime: 8,
      difficulty: "expert",
    },
    {
      name: "Engine Block",
      avgValue: 1200,
      weight: 180,
      removalTime: 4,
      difficulty: "difficult",
    },
    {
      name: "Cylinder Head",
      avgValue: 800,
      weight: 60,
      removalTime: 3,
      difficulty: "moderate",
    },
    {
      name: "Crankshaft",
      avgValue: 600,
      weight: 45,
      removalTime: 2,
      difficulty: "difficult",
    },
    {
      name: "Pistons Set",
      avgValue: 400,
      weight: 25,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Turbocharger",
      avgValue: 800,
      weight: 35,
      removalTime: 1.5,
      difficulty: "moderate",
    },
    {
      name: "Alternator",
      avgValue: 250,
      weight: 15,
      removalTime: 0.5,
      difficulty: "easy",
    },
    {
      name: "Starter Motor",
      avgValue: 200,
      weight: 12,
      removalTime: 0.5,
      difficulty: "easy",
    },
  ],

  // Transmission components
  transmission: [
    {
      name: "Transmission Assembly",
      avgValue: 2800,
      weight: 150,
      removalTime: 6,
      difficulty: "expert",
    },
    {
      name: "Transmission Case",
      avgValue: 600,
      weight: 80,
      removalTime: 3,
      difficulty: "difficult",
    },
    {
      name: "Torque Converter",
      avgValue: 400,
      weight: 25,
      removalTime: 1,
      difficulty: "moderate",
    },
    {
      name: "Clutch Kit",
      avgValue: 350,
      weight: 20,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Driveshaft",
      avgValue: 300,
      weight: 30,
      removalTime: 1,
      difficulty: "easy",
    },
  ],

  // Body components
  body: [
    {
      name: "Hood",
      avgValue: 400,
      weight: 40,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Front Fenders (pair)",
      avgValue: 600,
      weight: 50,
      removalTime: 1.5,
      difficulty: "easy",
    },
    {
      name: "Rear Fenders (pair)",
      avgValue: 500,
      weight: 45,
      removalTime: 1.5,
      difficulty: "easy",
    },
    {
      name: "Doors (set of 4)",
      avgValue: 800,
      weight: 120,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Trunk Lid",
      avgValue: 350,
      weight: 35,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Bumper Front",
      avgValue: 300,
      weight: 25,
      removalTime: 0.5,
      difficulty: "easy",
    },
    {
      name: "Bumper Rear",
      avgValue: 250,
      weight: 20,
      removalTime: 0.5,
      difficulty: "easy",
    },
    {
      name: "Grille",
      avgValue: 200,
      weight: 10,
      removalTime: 0.5,
      difficulty: "easy",
    },
  ],

  // Interior components
  interior: [
    {
      name: "Dashboard Assembly",
      avgValue: 600,
      weight: 40,
      removalTime: 3,
      difficulty: "moderate",
    },
    {
      name: "Seats (full set)",
      avgValue: 800,
      weight: 80,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Center Console",
      avgValue: 250,
      weight: 20,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Door Panels (set)",
      avgValue: 400,
      weight: 35,
      removalTime: 1.5,
      difficulty: "easy",
    },
    {
      name: "Steering Wheel",
      avgValue: 150,
      weight: 8,
      removalTime: 0.5,
      difficulty: "easy",
    },
    {
      name: "Instrument Cluster",
      avgValue: 300,
      weight: 5,
      removalTime: 1,
      difficulty: "moderate",
    },
  ],

  // Electronics
  electronics: [
    {
      name: "ECU/Engine Computer",
      avgValue: 400,
      weight: 2,
      removalTime: 0.5,
      difficulty: "moderate",
    },
    {
      name: "Audio System",
      avgValue: 200,
      weight: 15,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Navigation System",
      avgValue: 350,
      weight: 8,
      removalTime: 1,
      difficulty: "moderate",
    },
    {
      name: "Airbag Control Module",
      avgValue: 250,
      weight: 3,
      removalTime: 1,
      difficulty: "moderate",
    },
    {
      name: "Body Control Module",
      avgValue: 200,
      weight: 2,
      removalTime: 0.5,
      difficulty: "moderate",
    },
  ],

  // Suspension
  suspension: [
    {
      name: "Struts (set of 4)",
      avgValue: 600,
      weight: 60,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Control Arms (set)",
      avgValue: 400,
      weight: 40,
      removalTime: 2,
      difficulty: "moderate",
    },
    {
      name: "Sway Bars (set)",
      avgValue: 200,
      weight: 25,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Coil Springs (set)",
      avgValue: 300,
      weight: 30,
      removalTime: 1.5,
      difficulty: "moderate",
    },
  ],

  // Brakes
  brakes: [
    {
      name: "Brake Calipers (set)",
      avgValue: 400,
      weight: 30,
      removalTime: 1.5,
      difficulty: "moderate",
    },
    {
      name: "Brake Rotors (set)",
      avgValue: 200,
      weight: 40,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "ABS Module",
      avgValue: 350,
      weight: 8,
      removalTime: 1,
      difficulty: "moderate",
    },
  ],

  // Wheels and Tires
  wheels: [
    {
      name: "Wheels (set of 4)",
      avgValue: 600,
      weight: 80,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Tires (set of 4)",
      avgValue: 400,
      weight: 100,
      removalTime: 1,
      difficulty: "easy",
    },
    {
      name: "Spare Tire Assembly",
      avgValue: 200,
      weight: 35,
      removalTime: 0.5,
      difficulty: "easy",
    },
  ],
};

// Labor rates by region
export const LABOR_RATES = {
  national_avg: 85, // per hour
  southeast: 75,
  midwest: 80,
  northeast: 95,
  southwest: 78,
  west: 90,
  california: 110,
  new_york: 100,
  florida: 82,
  texas: 80,
};

// Parts sourcing from major marketplaces
export const PARTS_SOURCES = [
  { name: "carparts-com", url: "https://www.carparts.com", commission: 0.12 },
  { name: "rock-auto", url: "https://www.rockauto.com", commission: 0.15 },
  {
    name: "ebay-motors-parts",
    url: "https://www.ebay.com/motors/parts",
    commission: 0.1,
  },
  { name: "car-part-com", url: "https://www.car-part.com", commission: 0.08 },
];

export class PartsCalculator {
  // Calculate tear-down analysis for a vehicle
  async calculateTearDown(vehicleInfo: any): Promise<TearDownAnalysis> {
    const parts = await this.generatePartsList(vehicleInfo);
    const summary = this.calculateSummary(vehicleInfo, parts);
    const recommendations = this.generateRecommendations(
      vehicleInfo,
      parts,
      summary,
    );

    return {
      vehicleId: this.generateVehicleId(vehicleInfo),
      vehicleInfo,
      parts,
      summary,
      recommendations,
    };
  }

  // Generate parts list for a specific vehicle
  private async generatePartsList(vehicleInfo: any): Promise<Part[]> {
    const parts: Part[] = [];
    const { year, make, model, condition } = vehicleInfo;

    // Condition multipliers for part values
    const conditionMultipliers: Record<string, number> = {
      clean: 1.2,
      salvage: 1.0,
      rebuilt: 0.9,
      parts: 0.8,
    };

    const multiplier = conditionMultipliers[condition] || 1.0;

    // Damage type drives which parts survived (flood kills electronics, front-hit spares drivetrain…).
    const damageType: string | undefined =
      vehicleInfo.damageType || vehicleInfo.damage_type;

    // Generate parts for each category
    Object.entries(PARTS_DATABASE).forEach(([category, partTemplates]) => {
      const dmg = damageEffect(category as any, damageType);
      partTemplates.forEach((template) => {
        // Adjust value based on vehicle make/model/year, then by damage saleability.
        const adjustedValue = this.adjustPartValue(
          template.avgValue,
          year,
          make,
          model,
        );
        const value = Math.round(adjustedValue * multiplier * dmg.factor);

        const part: Part = {
          id: this.generatePartId(vehicleInfo, template.name),
          name: template.name,
          category: category as any,
          condition: this.determinePartCondition(condition),
          price: value,
          estimatedValue: value,
          weight: template.weight,
          removalDifficulty: template.difficulty as any,
          removalTime: template.removalTime,
          compatibility: [make, model],
          source: "teardown-analysis",
          damageStatus: dmg.status,
          notes:
            dmg.status === "scrap"
              ? `Likely compromised by ${damageType || "damage"} — minimal resale`
              : dmg.status === "in-demand"
                ? `Survives ${damageType || "damage"} — high part-out demand`
                : `Estimated value based on ${year} ${make} ${model}`,
        };

        parts.push(part);
      });
    });

    return parts;
  }

  // Adjust part value based on vehicle specifics
  private adjustPartValue(
    baseValue: number,
    year: number,
    make: string,
    model: string,
  ): number {
    let adjustedValue = baseValue;

    // Year adjustments
    const currentYear = new Date().getFullYear();
    const age = currentYear - year;

    if (age <= 3)
      adjustedValue *= 1.3; // Newer vehicles have more valuable parts
    else if (age <= 7) adjustedValue *= 1.1;
    else if (age <= 12) adjustedValue *= 1.0;
    else if (age <= 20) adjustedValue *= 0.8;
    else adjustedValue *= 0.6; // Older vehicles have less valuable parts

    // Make adjustments
    const makeMultipliers: Record<string, number> = {
      Toyota: 1.2,
      Honda: 1.2,
      Ford: 1.1,
      Chevrolet: 1.1,
      BMW: 1.4,
      "Mercedes-Benz": 1.4,
      Audi: 1.3,
      Lexus: 1.3,
      Porsche: 1.5,
      Tesla: 1.6,
    };

    if (makeMultipliers[make]) {
      adjustedValue *= makeMultipliers[make];
    }

    return Math.round(adjustedValue);
  }

  // Determine part condition based on vehicle condition
  private determinePartCondition(
    vehicleCondition: string,
  ): "new" | "used" | "remanufactured" | "salvage" {
    switch (vehicleCondition) {
      case "clean":
        return "used";
      case "rebuilt":
        return "remanufactured";
      case "salvage":
      case "parts":
        return "salvage";
      default:
        return "used";
    }
  }

  // Calculate summary metrics
  private calculateSummary(vehicleInfo: any, parts: Part[]) {
    const totalPartValue = parts.reduce(
      (sum, part) => sum + part.estimatedValue,
      0,
    );
    const totalLaborHours = parts.reduce(
      (sum, part) => sum + part.removalTime,
      0,
    );
    const totalRemovalCost = totalLaborHours * LABOR_RATES.national_avg;

    const purchasePrice = vehicleInfo.purchasePrice || 0;
    const transportCost = vehicleInfo.transportCost || 0;
    const totalCost = purchasePrice + transportCost + totalRemovalCost;

    const netProfit = totalPartValue - totalCost;
    const profitMargin = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    const roi = totalCost > 0 ? (netProfit / totalCost) * 100 : 0;
    const breakEvenPoint = totalCost;

    // Risk score based on various factors
    const riskScore = this.calculateRiskScore(vehicleInfo, parts, netProfit);

    return {
      totalPartValue,
      totalRemovalCost,
      totalLaborHours,
      netProfit,
      profitMargin: Math.round(profitMargin),
      roi: Math.round(roi),
      breakEvenPoint,
      riskScore,
    };
  }

  // Calculate risk score (0-100, lower is better)
  private calculateRiskScore(
    vehicleInfo: any,
    parts: Part[],
    netProfit: number,
  ): number {
    let riskScore = 50; // Base risk

    // Profit-based risk
    if (netProfit > 5000) riskScore -= 20;
    else if (netProfit > 2000) riskScore -= 10;
    else if (netProfit < 0) riskScore += 30;

    // Condition-based risk
    const condition: string = vehicleInfo.condition || "unknown";
    if (condition === "clean") riskScore -= 10;
    else if (condition === "salvage") riskScore += 15;
    else if (condition === "parts") riskScore += 25;

    // Age-based risk
    const age = new Date().getFullYear() - vehicleInfo.year;
    if (age <= 5) riskScore -= 5;
    else if (age > 15) riskScore += 10;

    // Make-based risk (common vs rare)
    const commonMakes = ["Toyota", "Honda", "Ford", "Chevrolet", "Nissan"];
    if (commonMakes.includes(vehicleInfo.make)) riskScore -= 5;
    else riskScore += 5;

    return Math.max(0, Math.min(100, riskScore));
  }

  // Generate recommendations
  private generateRecommendations(
    vehicleInfo: any,
    parts: Part[],
    summary: any,
  ): string[] {
    const recommendations: string[] = [];

    // Damage-aware guidance: what to pull first, what to skip.
    const dmgNote = damageSummary(
      vehicleInfo.damageType || vehicleInfo.damage_type,
    );
    if (dmgNote) recommendations.push(dmgNote);

    if (summary.netProfit > 3000) {
      recommendations.push(
        "High profit margin detected - recommend proceeding with tear-down",
      );
    } else if (summary.netProfit < 0) {
      recommendations.push(
        "Negative profit projected - consider selling whole vehicle instead",
      );
    }

    if (summary.riskScore > 70) {
      recommendations.push(
        "High risk score - ensure thorough inspection before proceeding",
      );
    }

    if (vehicleInfo.condition === "salvage") {
      recommendations.push(
        "Salvage title - verify parts market demand before tear-down",
      );
    }

    // High-value parts recommendations
    const highValueParts = parts.filter((p) => p.estimatedValue > 1000);
    if (highValueParts.length > 0) {
      recommendations.push(
        `Focus on high-value components: ${highValueParts.map((p) => p.name).join(", ")}`,
      );
    }

    // Labor recommendations
    if (summary.totalLaborHours > 40) {
      recommendations.push(
        "Extensive labor required - consider professional dismantling service",
      );
    }

    return recommendations;
  }

  // Generate unique vehicle ID
  private generateVehicleId(vehicleInfo: any): string {
    const { year, make, model, vin } = vehicleInfo;
    const base = `${year}-${make}-${model}-${vin || "unknown"}`;
    return Buffer.from(base)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 16);
  }

  // Generate unique part ID
  private generatePartId(vehicleInfo: any, partName: string): string {
    const base = `${vehicleInfo.year}-${vehicleInfo.make}-${vehicleInfo.model}-${partName}`;
    return Buffer.from(base)
      .toString("base64")
      .replace(/[^a-zA-Z0-9]/g, "")
      .substring(0, 16);
  }

  // Estimate repair costs for resale
  async estimateRepairCosts(vehicleInfo: any): Promise<RepairEstimate[]> {
    const repairs: RepairEstimate[] = [];
    const { condition, year, mileage } = vehicleInfo;

    // Base repair estimates by condition
    if (condition === "salvage") {
      repairs.push({
        category: "body",
        description: "Body damage repair",
        estimatedCost: 2500,
        estimatedHours: 20,
        partsNeeded: ["Body panels", "Paint supplies"],
        priority: "critical",
        notes: "Salvage title requires comprehensive body work",
      });
    }

    if (condition === "rebuilt") {
      repairs.push({
        category: "mechanical",
        description: "Mechanical systems verification",
        estimatedCost: 1200,
        estimatedHours: 12,
        partsNeeded: ["Filters", "Fluids", "Gaskets"],
        priority: "high",
      });
    }

    // Age-based repairs
    const vehicleAge = new Date().getFullYear() - year;
    if (vehicleAge > 10) {
      repairs.push({
        category: "mechanical",
        description: "Age-related wear items replacement",
        estimatedCost: 800,
        estimatedHours: 8,
        partsNeeded: ["Belts", "Hoses", "Brake components"],
        priority: "medium",
      });
    }

    // Mileage-based repairs
    if (mileage && mileage > 100000) {
      repairs.push({
        category: "mechanical",
        description: "High mileage service",
        estimatedCost: 1500,
        estimatedHours: 15,
        partsNeeded: ["Timing belt", "Water pump", "Spark plugs"],
        priority: "high",
      });
    }

    return repairs;
  }

  // Compare tear-down vs resale profitability
  async compareProfitability(vehicleInfo: any): Promise<{
    tearDown: TearDownAnalysis;
    resale: {
      estimatedSalePrice: number;
      repairCosts: RepairEstimate[];
      totalRepairCost: number;
      netProfit: number;
      roi: number;
    };
    recommendation: "teardown" | "resale" | "mixed";
    reasoning: string;
  }> {
    const tearDown = await this.calculateTearDown(vehicleInfo);
    const repairCosts = await this.estimateRepairCosts(vehicleInfo);

    const totalRepairCost = repairCosts.reduce(
      (sum, repair) => sum + repair.estimatedCost,
      0,
    );
    const estimatedSalePrice = this.estimateResaleValue(vehicleInfo);
    const resaleNetProfit =
      estimatedSalePrice - vehicleInfo.purchasePrice - totalRepairCost;
    const resaleROI =
      vehicleInfo.purchasePrice > 0
        ? (resaleNetProfit / vehicleInfo.purchasePrice) * 100
        : 0;

    let recommendation: "teardown" | "resale" | "mixed";
    let reasoning: string;

    if (tearDown.summary.netProfit > resaleNetProfit * 1.2) {
      recommendation = "teardown";
      reasoning = `Tear-down profit ($${tearDown.summary.netProfit.toLocaleString()}) significantly exceeds resale profit ($${resaleNetProfit.toLocaleString()})`;
    } else if (resaleNetProfit > tearDown.summary.netProfit * 1.2) {
      recommendation = "resale";
      reasoning = `Resale profit ($${resaleNetProfit.toLocaleString()}) significantly exceeds tear-down profit ($${tearDown.summary.netProfit.toLocaleString()})`;
    } else {
      recommendation = "mixed";
      reasoning =
        "Profits are similar - consider market conditions and available resources";
    }

    return {
      tearDown,
      resale: {
        estimatedSalePrice,
        repairCosts,
        totalRepairCost,
        netProfit: resaleNetProfit,
        roi: Math.round(resaleROI),
      },
      recommendation,
      reasoning,
    };
  }

  // Estimate resale value
  private estimateResaleValue(vehicleInfo: any): number {
    const { year, make, model, purchasePrice, condition } = vehicleInfo;

    // Base value on purchase price with adjustments
    let estimatedValue = purchasePrice * 1.3; // Assume 30% margin target

    // Condition adjustments
    const conditionMultipliers: Record<string, number> = {
      clean: 1.2,
      rebuilt: 0.9,
      salvage: 0.7,
      parts: 0.5,
    };

    if (conditionMultipliers[condition]) {
      estimatedValue *= conditionMultipliers[condition];
    }

    // Age adjustments
    const age = new Date().getFullYear() - year;
    if (age <= 3) estimatedValue *= 1.1;
    else if (age > 10) estimatedValue *= 0.9;

    return Math.round(estimatedValue);
  }
}
