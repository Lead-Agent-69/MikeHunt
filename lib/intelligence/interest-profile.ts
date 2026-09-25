import type { SupabaseClient } from "@supabase/supabase-js";
import {
  extractInterestProfile,
  type InterestProfile,
} from "./interest-patterns";

// Build a user's InterestProfile from IMPLICIT behavior — what they gravitate to, weighted saves(3) ≫
// watchlist(2) ≫ views(1) and recency-decayed. Shared by /api/recommendations and /api/feed so the
// "learns your taste" signal is identical everywhere. Returns an empty profile if there's nothing yet.
export async function buildInterestProfile(
  sb: SupabaseClient,
  userId: string,
): Promise<InterestProfile> {
  const [saved, watched, viewed] = await Promise.all([
    sb
      .from("saved_cars")
      .select("deal_id, price_at_save, saved_at")
      .eq("user_id", userId)
      .limit(300),
    sb
      .from("watchlist")
      .select("deal_id, created_at")
      .eq("user_id", userId)
      .limit(300),
    sb
      .from("deal_views")
      .select("deal_id, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const now = Date.now();
  const weightById = new Map<string, number>();
  const priceById = new Map<string, number>();
  const newestAtById = new Map<string, number>();
  const bump = (id: string | null, w: number, at?: string | null) => {
    if (!id) return;
    weightById.set(id, (weightById.get(id) || 0) + w);
    if (at) {
      const t = new Date(at).getTime();
      if (Number.isFinite(t))
        newestAtById.set(id, Math.max(newestAtById.get(id) || 0, t));
    }
  };
  for (const r of saved.data || []) {
    bump(r.deal_id, 3, (r as { saved_at?: string }).saved_at);
    if (r.deal_id && (r as { price_at_save?: number }).price_at_save)
      priceById.set(r.deal_id, Number((r as any).price_at_save));
  }
  for (const r of watched.data || [])
    bump(r.deal_id, 2, (r as { created_at?: string }).created_at);
  for (const r of viewed.data || [])
    bump(r.deal_id, 1, (r as { created_at?: string }).created_at);

  if (!weightById.size) return extractInterestProfile([]);

  const { data: sig } = await sb
    .from("deals")
    .select("id, make, model, ask_price, source")
    .in("id", Array.from(weightById.keys()));

  return extractInterestProfile(
    (sig || []).map((d: any) => ({
      make: d.make,
      model: d.model,
      price: priceById.get(d.id) ?? Number(d.ask_price) ?? null,
      source: d.source,
      weight: weightById.get(d.id) || 1,
      ageDays: newestAtById.has(d.id)
        ? (now - newestAtById.get(d.id)!) / 86_400_000
        : undefined,
    })),
  );
}
