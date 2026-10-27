"use client";

import useSWR, { useSWRConfig } from "swr";
import { invalidateSavedCollections } from "@/lib/saved/invalidate-collections";
import {
  fetchSavedMembership,
  type SavedMembership,
} from "@/lib/saved/membership";

/** Account identity belongs in the cache key, not in API authorization. */
export function useAccountSavedVehicles(
  ownerId: string | null,
  dealId: string,
) {
  const { mutate: invalidate } = useSWRConfig();
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
    confirm: async (confirmedDealId: string, savedId: string) => {
      if (!ownerId || confirmedDealId !== dealId || !savedId) return;
      await mutate({ ownerId, dealId, savedId }, { revalidate: false });
      // Revalidation failure cannot undo an already confirmed save.
      void invalidateSavedCollections(invalidate, ownerId).catch(
        () => undefined,
      );
    },
  };
}
