import type { ScopedMutator } from "swr";
import { unstable_serialize } from "swr/infinite";
import { savedCollectionKey } from "./collection";

export async function invalidateSavedCollections(
  mutate: ScopedMutator,
  ownerId: string,
) {
  // Infinite collections cache individual pages and a separate aggregate key.
  await mutate(
    (key) =>
      Array.isArray(key) &&
      key.length === 2 &&
      key[1] === ownerId &&
      typeof key[0] === "string" &&
      key[0].startsWith("/api/saved-cars?view="),
    undefined,
    { revalidate: false },
  );
  await Promise.all(
    (["page", "checklist-page"] as const).flatMap((view) =>
      ["all", "active", "price_drops", "gone"].map((filter) =>
        mutate(
          unstable_serialize(() => savedCollectionKey(ownerId, view, filter)),
          undefined,
          { revalidate: true },
        ),
      ),
    ),
  );
}
