import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchPurchaseChecklist,
  PURCHASE_CHECKLIST_KEY,
} from "./purchase-checklist";

afterEach(() => vi.unstubAllGlobals());

describe("purchase checklist confirmations", () => {
  it("rejects a successful HTTP response without a confirmed row array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "unavailable" }),
      }),
    );
    await expect(
      fetchPurchaseChecklist(PURCHASE_CHECKLIST_KEY),
    ).rejects.toThrow("Unconfirmed saved vehicles");
  });
  it("retains a genuine empty account result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    );
    await expect(
      fetchPurchaseChecklist(PURCHASE_CHECKLIST_KEY),
    ).resolves.toEqual([]);
  });
});
