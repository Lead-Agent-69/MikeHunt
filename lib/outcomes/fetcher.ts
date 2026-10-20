/** A late response must never populate another account's SWR cache key. */
export async function ownerOutcomeFetcher([url, ownerId]: [string, string]) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      "Your outcome history could not be loaded. Retry your records.",
    );
  const result = await response.json();
  if (result.ownerId !== ownerId || result.configured === false)
    throw new Error(
      "Your account or connection changed. Reload your outcome records.",
    );
  return result;
}
