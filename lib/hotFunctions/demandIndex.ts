import { getSupabaseClient } from "@/lib/supabase";

const supabase = getSupabaseClient();

export async function getMarketDemand(
  make: string,
  model: string,
  state: string,
) {
  // Query Supabase: how many of this make/model in this state
  const { count: activeListings } = await supabase
    .from("deals")
    .select("*", { count: "exact", head: true })
    .ilike("make", make)
    .ilike("model", `%${model}%`)
    .eq("location_state", state)
    .eq("active", true);

  // Days supply calculation: < 30 = high demand, 30-60 = normal, > 60 = soft
  const demandLevel =
    (activeListings || 0) < 20
      ? "high"
      : (activeListings || 0) < 50
        ? "normal"
        : "soft";

  return {
    activeListings,
    demandLevel,
    pricingAdvice:
      demandLevel === "high"
        ? "High demand — price at or above MMR"
        : demandLevel === "normal"
          ? "Normal market — price at MMR"
          : "Soft market — price 3-5% below MMR to move fast",
  };
}
