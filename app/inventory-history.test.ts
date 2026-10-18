import { afterEach, describe, expect, it, vi } from "vitest";
import {
  INVENTORY_URL_EVENT,
  replaceInventoryHistory,
} from "@/lib/search/inventory-history";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("Inventory URL updates", () => {
  it("preserves router and return metadata while notifying shared URL readers", () => {
    const original = {
      __NA: true,
      _N: true,
      marketReturnPosition: { id: "vehicle-one", top: 120, url: "/market" },
      customState: "keep",
    };
    window.history.replaceState(original, "", "/market");
    const replace = vi.spyOn(window.history, "replaceState");
    const dispatch = vi.spyOn(window, "dispatchEvent");
    replaceInventoryHistory("/market?near=63101&radius=50");
    expect(replace).toHaveBeenCalledWith(
      original,
      "",
      "/market?near=63101&radius=50",
    );
    expect(original.__NA).toBe(true);
    expect(original._N).toBe(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ type: INVENTORY_URL_EVENT }),
    );
  });

  it("supports a fresh history entry", () => {
    window.history.replaceState(null, "", "/market");
    const replace = vi.spyOn(window.history, "replaceState");
    replaceInventoryHistory("/market?states=MO,IL");
    expect(replace).toHaveBeenCalledWith(null, "", "/market?states=MO,IL");
  });
});
