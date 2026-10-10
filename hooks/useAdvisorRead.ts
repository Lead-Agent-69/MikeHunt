"use client";

import useSWR from "swr";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";

// One /api/check-listing read per car, cached by its request body. The route is rate limited
// (10/min), so this never refetches on focus and only runs when `body` is non-null.
async function postCheck(key: string): Promise<CheckListingRead> {
  const res = await fetch("/api/check-listing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: key,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.read) throw new Error(body?.error || "unavailable");
  return body.read as CheckListingRead;
}

export function useAdvisorRead(body: Record<string, unknown> | null) {
  const key = body ? JSON.stringify(body) : null;
  return useSWR(key, postCheck, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    shouldRetryOnError: false,
    dedupingInterval: 10 * 60_000,
  });
}
