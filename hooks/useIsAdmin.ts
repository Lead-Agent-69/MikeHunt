"use client";

import useSWR from "swr";

const fetcher = (u: string) => fetch(u).then((r) => r.json());

/** Whether the current user is THE admin (server-checked). Drives showing the admin-only nav. */
export function useIsAdmin() {
  const { data } = useSWR("/api/auth/whoami", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  return {
    isAdmin: !!data?.isAdmin,
    email: (data?.email as string | null) ?? null,
    loading: data === undefined,
  };
}
