export type SavedMembership = {
  ownerId: string;
  dealId: string;
  savedId: string | null;
};

export async function fetchSavedMembership(
  ownerId: string,
  dealId: string,
): Promise<SavedMembership> {
  const response = await fetch(
    `/api/saved-cars?view=membership&dealId=${encodeURIComponent(dealId)}`,
    {
      headers: { "X-Save-Owner": ownerId },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error("Saved vehicles could not be verified");
  const data = await response.json();
  // Empty membership also needs an owner receipt; an empty array cannot prove whose account was read.
  if (
    !data ||
    data.ownerId !== ownerId ||
    data.dealId !== dealId ||
    !(
      data.savedId === null ||
      (typeof data.savedId === "string" && data.savedId.length > 0)
    )
  ) {
    throw new Error("Saved vehicles could not be verified");
  }
  return data;
}
