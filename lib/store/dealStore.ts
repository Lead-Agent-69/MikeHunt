import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UserType = "dealer" | "private" | "parts";

interface DealState {
  // Config
  userType: UserType;

  // Base Vehicle Inputs
  askPrice: number;
  marketValue: number;
  year: number;
  make: string;
  model: string;
  vin: string;
  miles: number;
  titleType: "clean" | "rebuilt" | "salvage" | "parts_only";
  damageSeverity: "none" | "minor" | "moderate" | "severe" | "destroyed";
  marketDemand: "high" | "medium" | "low"; // High for F150, Tacoma etc.
  daysOnMarket: number;
  openRecalls: number;

  // Editable Costs (Defaults pre-filled)
  auctionFee: number;
  transportCost: number;
  repairCost: number;
  reconCost: number;
  titleFee: number;
  floorRate: number; // Daily holding cost
  estimatedDaysToSell: number;

  // Private Buyer specific costs
  annualInsurance: number;
  annualMaintenance: number;

  // Computed Outputs
  totalCost: number;
  netProfit: number; // Or "Savings" for private buyer
  roi: number;
  profitScore: number;
  verdict: "GO" | "HOLD" | "PASS";

  // Actions
  setUserType: (type: UserType) => void;
  updateField: (field: keyof DealState, value: any) => void;
  recalculate: () => void;
  loadDeal: (deal: any) => void;
  cachedDeals: Record<string, any>;
  addDealToCache: (id: string, deal: any) => void;
}

// Helper: Demand Points
const getDemandPoints = (demand: string) => {
  if (demand === "high") return 8;
  if (demand === "medium") return 4;
  return 0;
};

// Helper: Title Points
const getTitlePoints = (title: string, userType: UserType) => {
  if (userType === "parts" && title === "parts_only") return 20; // Parts buyers WANT cheap parts cars
  if (title === "clean") return 20;
  if (title === "rebuilt") return 10;
  if (title === "salvage") return 4;
  return 0;
};

// Helper: Damage Points
const getDamagePoints = (damage: string, userType: UserType) => {
  if (userType === "parts") return damage === "destroyed" ? 0 : 12; // Parts buyers don't mind moderate damage if engine is good
  if (damage === "none") return 12;
  if (damage === "minor") return 10;
  if (damage === "moderate") return 5;
  if (damage === "severe") return 2;
  return 0;
};

// Helper: Mileage Penalty
const getMileagePenalty = (miles: number) => {
  if (miles < 70000) return 0;
  if (miles > 150000) return -10;
  return -Math.floor(((miles - 70000) / 80000) * 10); // Linear scale between 70k and 150k
};

export const useDealStore = create<DealState>()(
  persist(
    (set, get) => ({
      userType: "dealer",
      cachedDeals: {},
      addDealToCache: (id, deal) => {
        set((state) => ({
          cachedDeals: {
            ...state.cachedDeals,
            [id]: deal,
          },
        }));
      },

      // Empty defaults — real values are loaded from the deal via loadDeal(). No fake seed car.
      askPrice: 0,
      marketValue: 0,
      year: 0,
      make: "",
      model: "",
      vin: "",
      miles: 0,
      titleType: "clean",
      damageSeverity: "none",
      marketDemand: "medium",
      daysOnMarket: 0,
      openRecalls: 0,

      auctionFee: 0,
      transportCost: 0,
      repairCost: 0,
      reconCost: 0,
      titleFee: 0,
      floorRate: 35,
      estimatedDaysToSell: 30,

      annualInsurance: 1200,
      annualMaintenance: 800,

      totalCost: 0,
      netProfit: 0,
      roi: 0,
      profitScore: 0,
      verdict: "PASS",

      setUserType: (type) => {
        set({ userType: type });
        get().recalculate();
      },

      updateField: (field, value) => {
        set({ [field]: value } as Partial<DealState>);
        get().recalculate();
      },

      loadDeal: (deal) => {
        const titleTypeMapped = (() => {
          const c = (deal.condition || "").toLowerCase();
          if (c.includes("clean")) return "clean";
          if (c.includes("rebuilt")) return "rebuilt";
          if (c.includes("salvage")) return "salvage";
          if (c.includes("parts")) return "parts_only";
          return "clean";
        })();

        const damageSeverityMapped = (() => {
          const d = (deal.damageType || deal.damage_type || "").toLowerCase();
          if (d.includes("none") || !d) return "none";
          if (
            d.includes("minor") ||
            d.includes("scratch") ||
            d.includes("hail")
          )
            return "minor";
          if (
            d.includes("severe") ||
            d.includes("major") ||
            d.includes("frame")
          )
            return "severe";
          if (
            d.includes("destroyed") ||
            d.includes("burn") ||
            d.includes("stripped") ||
            d.includes("missing")
          )
            return "destroyed";
          return "moderate";
        })();

        const demandMapped = (() => {
          const m = (deal.make || "").toLowerCase();
          if (
            [
              "ford",
              "toyota",
              "chevrolet",
              "honda",
              "nissan",
              "ram",
              "gmc",
            ].includes(m)
          )
            return "high";
          if (
            [
              "bmw",
              "mercedes",
              "audi",
              "lexus",
              "jeep",
              "dodge",
              "subaru",
              "kia",
              "hyundai",
            ].includes(m)
          )
            return "medium";
          return "low";
        })();

        const askPrice = deal.askPrice ?? deal.ask_price ?? 0;
        // Prefer the server decision engine's values (comps-based sell, computed transport/repair).
        const marketValue =
          deal.sellEstimate ??
          deal.mmrValue ??
          deal.mmr_value ??
          deal.market_value ??
          0;
        const miles = deal.mileage ?? deal.miles ?? 0;
        const transportCost =
          deal.estimated_transport_cost ??
          deal.transport_cost ??
          deal.transportCost ??
          810;
        const repairCost =
          deal.estimated_repair_cost ??
          deal.repair_estimate ??
          deal.repairCost ??
          0;
        const auctionFee = deal.auctionFee ?? 450;
        const reconCost = deal.reconCost ?? 500;
        const titleFee = deal.titleFee ?? 120;
        const floorRate = deal.floorRate ?? 35;
        const estimatedDaysToSell = deal.estimatedDaysToSell ?? 30;

        set({
          askPrice,
          marketValue,
          year: deal.year || 2020,
          make: deal.make || "Unknown",
          model: deal.model || "Unknown",
          vin: deal.vin || "",
          miles,
          titleType: titleTypeMapped as any,
          damageSeverity: damageSeverityMapped as any,
          marketDemand: demandMapped as any,
          daysOnMarket: deal.daysOnMarket || 14,
          openRecalls: deal.openRecalls ?? 0,
          transportCost,
          repairCost,
          auctionFee,
          reconCost,
          titleFee,
          floorRate,
          estimatedDaysToSell,
        });

        get().recalculate();
      },

      recalculate: () => {
        const s = get();

        // 1. Calculate Total Costs based on user type
        let total = s.askPrice;
        let holdingCost = 0;

        if (s.userType === "dealer") {
          holdingCost = s.floorRate * s.estimatedDaysToSell;
          total +=
            s.auctionFee +
            s.transportCost +
            s.repairCost +
            s.reconCost +
            s.titleFee +
            holdingCost;
        } else if (s.userType === "private") {
          // Private buyer worries about transport, repair, title, PLUS year 1 ownership cost
          total += s.transportCost + s.repairCost + s.titleFee;
        } else if (s.userType === "parts") {
          // Parts buyer: buy car + transport. Repairs don't matter, they are tearing it down.
          total += s.auctionFee + s.transportCost;
        }

        // 2. Net Profit / Savings
        let margin = 0;
        if (s.userType === "parts") {
          // For parts, 'marketValue' represents the estimated total part-out value
          margin = s.marketValue - total;
        } else {
          margin = s.marketValue - total;
        }

        // ROI
        const roiCalc = total > 0 ? (margin / total) * 100 : 0;

        // 3. Compute the 8-Factor Score
        let score = 0;

        // Factor 1: Margin vs Ask Price (0-35 points)
        // Dealer/Private: If margin is $3500+, full points.
        const marginPts = Math.max(0, Math.min(35, (margin / 3500) * 35));
        score += marginPts;

        // Factor 2: ROI Percentage (0-25 points)
        // 30%+ ROI is full points
        const roiPts = Math.max(0, Math.min(25, (roiCalc / 30) * 25));
        score += roiPts;

        // Factor 3: Title (0-20 points)
        score += getTitlePoints(s.titleType, s.userType);

        // Factor 4: Damage (0-12 points)
        score += getDamagePoints(s.damageSeverity, s.userType);

        // Factor 5: Demand (0-8 points)
        score += getDemandPoints(s.marketDemand);

        // Factor 6: Mileage Penalty (0 to -10)
        score += getMileagePenalty(s.miles);

        // Hard floor limits
        score = Math.max(0, Math.min(100, Math.round(score)));

        // 4. Verdict Logic
        let newVerdict: "GO" | "HOLD" | "PASS" = "PASS";
        if (score >= 80) newVerdict = "GO";
        else if (score >= 60) newVerdict = "HOLD";

        set({
          totalCost: total,
          netProfit: margin,
          roi: Math.round(roiCalc),
          profitScore: score,
          verdict: newVerdict,
        });
      },
    }),
    {
      name: "dealerhunt-deal-store",
    },
  ),
);
