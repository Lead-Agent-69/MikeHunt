export async function markInventoryListed(
  ids: string[],
  platforms: string[],
  request: typeof fetch = fetch,
) {
  if (!platforms.length) throw new Error("Select a marketplace first");
  const uniqueIds = Array.from(new Set(ids));
  const results = await Promise.allSettled(
    uniqueIds.map(async (id) => {
      const response = await request("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          stage: "listed",
          listed_platforms: platforms,
        }),
      });
      if (!response.ok) throw new Error("Listing update failed");
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
