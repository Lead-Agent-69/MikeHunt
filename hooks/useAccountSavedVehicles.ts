"use client";

import useSWR from "swr";
import {
  fetchSavedMembership,
  type SavedMembership,
} from "@/lib/saved/membership";

/** Account identity belongs in the cache key, not in API authorization. */
export function useAccountSavedVehicles(
  ownerId: string | null,
  dealId: string,
) {
  const { data, error, isLoading, mutate } = useSWR<SavedMembership>(
    ownerId && dealId ? ["saved-membership", ownerId, dealId] : null,
    ([, owner, deal]: [string, string, string]) =>
      fetchSavedMembership(owner, deal),
    {
      keepPreviousData: false,
      dedupingInterval: 60_000,
      errorRetryCount: 1,
    },
  );

  return {
    has: (dealId: string) =>
      Boolean(
        ownerId &&
        data?.ownerId === ownerId &&
        data.dealId === dealId &&
        data.savedId,
      ),
    isLoading: Boolean(ownerId && isLoading),
    error: ownerId ? error : undefined,
    confirm: (confirmedDealId: string, savedId: string) =>
      ownerId && confirmedDealId === dealId && savedId
        ? mutate({ ownerId, dealId, savedId }, { revalidate: false })
        : Promise.resolve(),
  };
}
