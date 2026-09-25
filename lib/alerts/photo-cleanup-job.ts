import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Periodically cleans up Supabase Storage by removing hosted photos for
 * inactive deals that no user has saved. Keeps storage usage lean.
 */
export async function runPhotoStorageCleanup() {
  if (!supabaseUrl || !supabaseKey) return;

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log("[PhotoCleanup] Starting background photo cleanup job...");

  // Fetch inactive deals that have our hosted photo
  const { data: inactiveDeals, error } = await supabase
    .from("deals")
    .select("id, images")
    .eq("active", false)
    .limit(100);

  if (error || !inactiveDeals) {
    console.error("[PhotoCleanup] Failed to fetch inactive deals:", error);
    return;
  }

  // Filter deals that actually have a hosted photo in their array
  const dealsWithPhotos = inactiveDeals.filter(
    (d) =>
      d.images && d.images.length > 0 && d.images[0].includes("deals-photos"),
  );

  if (dealsWithPhotos.length === 0) {
    console.log("[PhotoCleanup] No inactive deals with hosted photos found.");
    return;
  }

  // Check if any of these deals are saved by users
  const dealIds = dealsWithPhotos.map((d) => d.id);
  const { data: savedCars, error: savedError } = await supabase
    .from("saved_cars")
    .select("deal_id")
    .in("deal_id", dealIds);

  if (savedError) {
    console.error("[PhotoCleanup] Failed to check saved_cars:", savedError);
    return;
  }

  const savedDealIds = new Set(savedCars?.map((s) => s.deal_id) || []);

  const dealsToDelete = dealsWithPhotos.filter((d) => !savedDealIds.has(d.id));

  console.log(
    `[PhotoCleanup] Found ${dealsToDelete.length} obsolete photos to clean up.`,
  );

  let cleanedCount = 0;

  for (const deal of dealsToDelete) {
    try {
      const primaryPhotoUrl = deal.images[0];

      // Extract the path from the URL
      // e.g., https://xyz.supabase.co/storage/v1/object/public/deals-photos/123/primary.jpg
      const pathMatch = primaryPhotoUrl.match(/deals-photos\/(.+)$/);
      if (!pathMatch) continue;

      const filePath = pathMatch[1];

      // Remove from storage
      const { error: removeError } = await supabase.storage
        .from("deals-photos")
        .remove([filePath]);

      if (removeError) {
        console.error(
          `[PhotoCleanup] Failed to remove storage object ${filePath}:`,
          removeError,
        );
        continue;
      }

      // Revert DB images array (remove the first element, shifting the external URL back)
      const newImages = deal.images.slice(1);

      const { error: updateError } = await supabase
        .from("deals")
        .update({ images: newImages })
        .eq("id", deal.id);

      if (updateError) {
        console.error(
          `[PhotoCleanup] Failed to update DB for deal ${deal.id}:`,
          updateError,
        );
      } else {
        cleanedCount++;
      }
    } catch (err) {
      console.error(`[PhotoCleanup] Error processing deal ${deal.id}:`, err);
    }
  }

  console.log(`[PhotoCleanup] Completed. Cleaned up ${cleanedCount} photos.`);
}
