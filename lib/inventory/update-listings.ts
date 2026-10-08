export async function markInventoryListed(
  ids: string[],
  platforms: string[],
  request: typeof fetch = fetch,
  existingPlatforms: Record<string, string[]> = {},
) {
  if (!platforms.length) throw new Error("Select a marketplace first");
  const uniqueIds = Array.from(new Set(ids));
  const results = await Promise.allSettled(
    uniqueIds.map(async (id) => {
      const response = await request("/api/inventory", {
        signal: AbortSignal.timeout(20000),
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          stage: "listed",
          listed_platforms: Array.from(
            new Set([...(existingPlatforms[id] || []), ...platforms]),
          ),
        }),
      });
      if (!response.ok) throw new Error("Listing update failed");
      const result = await response.json();
      const expected = [...(existingPlatforms[id] || []), ...platforms];
      if (
        result.item?.id !== id ||
        result.item.stage !== "listed" ||
        !Array.isArray(result.item.listedPlatforms) ||
        !expected.every((platform) =>
          result.item.listedPlatforms?.includes(platform),
        )
      )
        throw new Error("Listing update not confirmed");
      return id;
    }),
  );
  return {
    updatedIds: uniqueIds.filter(
      (_, index) => results[index].status === "fulfilled",
    ),
    failedIds: uniqueIds.filter(
      (_, index) => results[index].status === "rejected",
    ),
  };
}
