import { createServerComponentClient } from "@/lib/supabase";

export async function getMarketDemand(
  make: string,
  model: string,
  state: string,
) {
  // Query Supabase: how many of this make/model in this state
  // Server-side (service role) count of a granted column only: the anon role no longer has
  // table-wide SELECT on deals, so select("*") would 42501.
  const supabase = createServerComponentClient();
  const { count: activeListings } = await supabase
    .from("deals")
    .select("id", { count: "exact", head: true })
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
