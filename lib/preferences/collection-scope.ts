import {
  normalizeBuyerScope,
  type BuyerScope,
} from "@/lib/scrapers/buyer-scope";
import { includesRepairable } from "@/lib/intelligence/repair-risk";

const VEHICLES: Record<string, string> = {
  SUVs: "suv",
  Trucks: "truck",
  Sedans: "sedan",
  Coupes: "coupe",
  Convertibles: "convertible",
  Vans: "van",
  Luxury: "luxury",
  "Hybrid / EV": "hybrid ev",
  Performance: "performance",
  Diesel: "diesel",
};

/** Translate the persisted profile, not display labels, into collector eligibility. */
export function preferenceCollectionScope(
  prefs: { buyerScope?: Record<string, unknown> | null },
  states: string[],
): BuyerScope {
  const intent = prefs.buyerScope || {};
  const vehicles = Array.isArray(intent.vehicles)
    ? intent.vehicles.filter(
        (v): v is string => typeof v === "string" && !!VEHICLES[v],
      )
    : [];
  const vehicleType = vehicles.length
    ? vehicles.map((v) => VEHICLES[v]).join(" ")
    : VEHICLES[String(intent.vehicle || "")] || intent.vehicleType;
  const includeRepairable = includesRepairable({
    buyerMode:
      typeof intent.buyerMode === "string" ? intent.buyerMode : undefined,
    includeRepairable:
      typeof intent.includeRepairable === "boolean"
        ? intent.includeRepairable
        : undefined,
  });
  const selectedLane = intent.laneValue || intent.lane;
  // A personal profile that excludes repairable cars must not collect auction inventory by default.
  const lane =
    (!selectedLane || selectedLane === "all" || selectedLane === "All deals") &&
    intent.buyerMode === "personal" &&
    !includeRepairable
      ? "clean-retail"
      : selectedLane;
  return normalizeBuyerScope({
    ...intent,
    vehicle: undefined,
    vehicleType,
    lane,
    includeRepairable,
    state: states[0],
    states: states.length > 1 ? states : undefined,
    dealerHosts: intent.watchedDealers,
    dealerSourceIds: intent.watchedDealerSourceIds,
  });
}
