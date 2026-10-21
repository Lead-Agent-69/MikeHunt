import type { InventoryItem } from "@/lib/data/inventory-service";
import { HttpRequestError, retryAfterMs } from "@/lib/swr-config";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { mutate as mutateCache } from "swr";

export interface InventoryResult {
  ownerId: string;
  items: InventoryItem[];
  total: number;
  hasMore: boolean;
}

interface InventoryConfirmation {
  ownerId: string;
  item: InventoryItem;
  outcomeReview?: { synced: boolean; message: string };
}

const accountChanged = () =>
  new Error("Your account changed. Reload your vehicles before continuing.");

/** Clear other inventory views so client navigation cannot reuse a stale stage or list. */
export function invalidateInventoryViews(ownerId: string, keepUrl?: string) {
  void mutateCache(
    (key: unknown) =>
      Array.isArray(key) &&
      key[1] === ownerId &&
      typeof key[0] === "string" &&
      (key[0] === "/api/inventory" || key[0].startsWith("/api/inventory?")) &&
      key[0] !== keepUrl,
    undefined,
    { revalidate: true },
  ).catch(() => {
    // A failed refresh must not turn an acknowledged write into a failed save.
    // Active views expose their own fetch error and retry; inactive views stay invalidated.
  });
}

/** The session authorizes the request; the expected owner protects its cache key. */
export async function ownerInventoryFetcher([url, ownerId]: [string, string]) {
  const response = await fetch(url, {
    headers: { "x-inventory-owner": ownerId },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new HttpRequestError(
      response.status,
      retryAfterMs(response.headers.get("Retry-After")),
    );
  const result: InventoryResult & { configured?: boolean } =
    await response.json();
  if (
    result.ownerId !== ownerId ||
    result.configured === false ||
    !Array.isArray(result.items) ||
    result.items.some((item) => !item?.id || item.dealerId !== ownerId)
  )
    throw accountChanged();
  return result;
}

/** Only a confirmed row for the submitting account may update the screen. */
export async function writeInventory(
  ownerId: string,
  method: "POST" | "PATCH",
  body: Record<string, unknown>,
): Promise<InventoryConfirmation> {
  if (!ownerId) throw accountChanged();
  const response = await fetch("/api/inventory", {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-inventory-owner": ownerId,
    },
    signal: AbortSignal.timeout(20_000),
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      userFacingErrorMessage(
        result.error,
        "The change was not confirmed. Reload your vehicles before retrying.",
      ),
    );
  if (
    result.ownerId !== ownerId ||
    !result.item?.id ||
    result.item.dealerId !== ownerId ||
    (body.id && result.item.id !== body.id) ||
    (body.stage && result.item.stage !== body.stage)
  )
    throw accountChanged();
  return result;
}
