import type { BuyerIntent } from "@/hooks/useBuyerIntent";
import { US_STATES } from "@/lib/utils/titleRules";

const CATEGORIES: Record<string, string> = {
  SUVs: "suvs",
  Trucks: "trucks",
  Sedans: "sedans",
  Coupes: "coupes",
  Convertibles: "convertibles",
  Vans: "vans",
  Luxury: "luxury",
  "Hybrid / EV": "electric",
};

/** The first results must honor the choices shown in the setup preview. */
export function onboardingMarketHref(intent: BuyerIntent) {
  const params = new URLSearchParams();
  if (intent.state && US_STATES.includes(intent.state))
    params.set("states", intent.state);
  if (intent.minPrice) params.set("priceMin", String(intent.minPrice));
  if (intent.maxPrice) params.set("priceMax", String(intent.maxPrice));
  const selected = intent.vehicles?.length
    ? intent.vehicles
    : [intent.vehicle || ""];
  const categories = Array.from(
    new Set(selected.map((value) => CATEGORIES[value]).filter(Boolean)),
  );
  if (!selected.includes("All vehicle types") && categories.length)
    params.set("categories", categories.join(","));
  if (["clean", "salvage", "rebuilt"].includes(intent.titleType || ""))
    params.set("titleType", intent.titleType!);
  params.set("includeRepairable", intent.includeRepairable ? "1" : "0");
  params.set("hasPhotos", "yes");
  return `/market?${params.toString()}`;
}
