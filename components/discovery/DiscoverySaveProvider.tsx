"use client";

import { createContext, useContext, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useDealerId } from "@/hooks/useDealerId";
import {
  useLocalSavedVehicles,
  toLocalSavedVehicle,
} from "@/hooks/useLocalSavedVehicles";
import { isSupabaseConfigured } from "@/lib/supabase";
import type { DiscoveryDeal } from "./types";
import { toast } from "sonner";

type SavedRow = { id: string; deal_id: string; user_id: string };
type SaveControl = {
  saved: boolean;
  busy: boolean;
  label: string;
  toggle: () => Promise<void>;
};
const Context = createContext<((deal: DiscoveryDeal) => SaveControl) | null>(
  null,
);

export function DiscoverySaveProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { dealerId, loading, error: authError } = useDealerId();
  const local = useLocalSavedVehicles();
  const { mutate: invalidate } = useSWRConfig();
  const owner = isSupabaseConfigured() ? dealerId : null;
  const currentOwner = useRef(owner);
  currentOwner.current = owner;
  const locks = useRef(new Set<string>());
  const [pending, setPending] = useState<string[]>([]);
  const { data, error, mutate } = useSWR<SavedRow[]>(
    owner ? `/api/saved-cars?filter=all&dealerId=${owner}` : null,
    async (url: string) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Saved vehicles unavailable");
      const rows: unknown = await response.json();
      if (
        !Array.isArray(rows) ||
        rows.some(
          (row) =>
            !row ||
            typeof row.id !== "string" ||
            !row.id ||
            typeof row.deal_id !== "string" ||
            row.user_id !== owner,
        )
      )
        throw new Error("Saved vehicles could not be verified");
      return rows;
    },
    { revalidateOnFocus: true, keepPreviousData: false },
  );

  return (
    <Context.Provider
      value={(deal) => {
        // Live-search rows are not persisted deal records and cannot be account-saved yet.
        const account = !!owner && !deal.id.startsWith("live-");
        const row = account
          ? data?.find((item) => item.deal_id === deal.id)
          : undefined;
        const saved = account ? !!row : local.has(deal.id);
        const lock = `${owner ?? "device"}:${deal.id}`;
        const busy =
          loading || pending.includes(lock) || (account && !data && !error);
        const label = busy
          ? "Loading saved state"
          : authError
            ? "Account unavailable"
            : account && error
              ? "Retry saved vehicles"
              : account
                ? saved
                  ? "Remove from account"
                  : "Save to account"
                : saved
                  ? "Remove device bookmark"
                  : "Save on this device";
        return {
          saved,
          busy,
          label,
          toggle: async () => {
            if (busy || locks.current.has(lock)) return;
            if (authError) {
              toast.error(
                "Your account could not be checked. Reload and try again.",
              );
              return;
            }
            if (account && error) {
              await mutate().catch(() => undefined);
              return;
            }
            if (!account) {
              const confirmed = saved
                ? local.remove(deal.id)
                : local.save(toLocalSavedVehicle(deal));
              if (!confirmed)
                toast.error(
                  "Device storage is unavailable. This bookmark was not changed.",
                );
              else
                toast.success(
                  saved
                    ? "Device bookmark removed"
                    : "Saved on this device only",
                );
              return;
            }
            locks.current.add(lock);
            setPending(Array.from(locks.current));
            try {
              const response = await fetch(
                row
                  ? `/api/saved-cars/${encodeURIComponent(row.id)}`
                  : "/api/saved-cars",
                {
                  method: row ? "DELETE" : "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "X-Save-Owner": owner!,
                  },
                  ...(row ? {} : { body: JSON.stringify({ dealId: deal.id }) }),
                },
              );
              const result = await response.json();
              const confirmed = row
                ? response.ok && result.success === true && result.id === row.id
                : !result.demo &&
                  typeof result.id === "string" &&
                  !!result.id &&
                  ((response.ok && result.success === true) ||
                    response.status === 409);
              if (!confirmed) throw new Error("Save not confirmed");
              if (currentOwner.current !== owner) return;
              if (row) {
                await mutate(
                  (rows) => (rows || []).filter((item) => item.id !== row.id),
                  false,
                );
              } else {
                // Saved shares this cache and needs complete snapshots, not synthetic id-only rows.
                await mutate().catch(() => undefined);
              }
              if (currentOwner.current !== owner) return;
              // Refresh other Saved views, but do not turn a refresh failure into a failed mutation.
              void invalidate(
                (key) =>
                  typeof key === "string" &&
                  key.startsWith("/api/saved-cars?") &&
                  key.endsWith(`dealerId=${owner}`),
                undefined,
                { revalidate: true },
              ).catch(() => undefined);
              const deviceRemoved =
                !row || !local.has(deal.id) || local.remove(deal.id);
              toast.success(
                row ? "Removed from account" : "Saved to your account",
              );
              if (!deviceRemoved)
                toast.error("The device bookmark could not be removed.");
            } catch {
              if (currentOwner.current === owner)
                toast.error("Account bookmark was not confirmed. Try again.");
            } finally {
              locks.current.delete(lock);
              setPending(Array.from(locks.current));
            }
          },
        };
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useDiscoverySave(deal: DiscoveryDeal) {
  const controls = useContext(Context);
  if (!controls)
    throw new Error("Discovery cards require DiscoverySaveProvider");
  return controls(deal);
}
