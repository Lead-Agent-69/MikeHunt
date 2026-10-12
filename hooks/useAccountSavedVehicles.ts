"use client";

import useSWR from "swr";
import {
  PURCHASE_CHECKLIST_KEY,
  fetchPurchaseChecklist,
  type PurchaseChecklistRow,
} from "@/lib/saved/purchase-checklist";

/** Account identity belongs in the cache key, not in API authorization. */
export function useAccountSavedVehicles(ownerId: string | null) {
  const { data, error, isLoading, mutate } = useSWR<PurchaseChecklistRow[]>(
    ownerId ? [PURCHASE_CHECKLIST_KEY, ownerId] : null,
    async ([url]: [string, string]) => {
      const rows = await fetchPurchaseChecklist(url);
      if (
        rows.some(
          (row) =>
            !row ||
            typeof row.id !== "string" ||
            !row.id ||
            typeof row.deal_id !== "string" ||
            !row.deal_id,
        )
      )
        throw new Error("Saved vehicles could not be verified");
      return rows;
    },
    {
      keepPreviousData: false,
      dedupingInterval: 60_000,
      errorRetryCount: 1,
    },
  );

  return {
    has: (dealId: string) =>
      Boolean(ownerId && data?.some((row) => row.deal_id === dealId)),
    isLoading: Boolean(ownerId && isLoading),
    error: ownerId ? error : undefined,
    confirm: (dealId: string, savedId: string) =>
      mutate(
        (rows = []) =>
          rows.some((row) => row.deal_id === dealId)
            ? rows
            : [
                ...rows,
                {
                  id: savedId,
                  deal_id: dealId,
                  status: "watching",
                  snapshot: {},
                },
              ],
        { revalidate: false },
      ),
  };
}
