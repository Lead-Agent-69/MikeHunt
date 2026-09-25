import { createClient } from "@supabase/supabase-js";
import { syncDealPhotos } from "../data/photo-storage";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Periodically downloads primary photos for high-profit deals and uploads them
 * to permanent Supabase Storage to prevent external hotlink blocking.
 */
export async function runPhotoStorageSync() {
  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("[PhotoSync] Starting background photo sync job...");

  // Fetch top 50 active deals with profit_score >= 80
  const { data: deals, error } = await supabase
    .from("deals")
    .select("id, images")
    .eq("active", true)
    .gte("profit_score", 80)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error || !deals) {
    console.error("[PhotoSync] Failed to fetch deals:", error);
    return;
  }

  // Filter deals that need syncing (primary photo not in deals-photos bucket)
  const dealsToSync = deals.filter(
    (d) =>
      d.images && d.images.length > 0 && !d.images[0].includes("deals-photos"),
  );

  console.log(
    `[PhotoSync] Found ${dealsToSync.length} high-profit deals to sync.`,
  );

  let syncedCount = 0;

  for (const deal of dealsToSync) {
    try {
      const permanentUrl = await syncDealPhotos(supabase, deal as any);

      if (permanentUrl) {
        const newImages = [permanentUrl, ...deal.images];

        const { error: updateError } = await supabase
          .from("deals")
          .update({ images: newImages })
          .eq("id", deal.id);

        if (updateError) {
          console.error(
            `[PhotoSync] Failed to update DB for deal ${deal.id}:`,
            updateError,
          );
        } else {
          syncedCount++;
        }
      }
    } catch (err) {
      console.error(`[PhotoSync] Error processing deal ${deal.id}:`, err);
    }
  }

  console.log(`[PhotoSync] Completed. Synced ${syncedCount} photos.`);
}
