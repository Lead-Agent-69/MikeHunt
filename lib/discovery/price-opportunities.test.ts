import { afterEach, describe, expect, it, vi } from "vitest";
import { loadPriceOpportunities } from "./price-opportunities";
afterEach(() => vi.unstubAllGlobals());
const response = (body: unknown, ok = true) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok, json: async () => body })),
  );
describe("price opportunity collection contract", () => {
  it("accepts successful empty inventory without implying source failure", async () => {
    response({ deals: [], count: 0, state: "FL" });
    expect(
      await loadPriceOpportunities("/api/flash-deals?state=FL"),
    ).toMatchObject({ deals: [], state: "FL" });
  });
  it("unconfigured inventory is unavailable rather than empty", async () => {
    response({ configured: false, deals: [], count: 0, state: "nationwide" });
    await expect(loadPriceOpportunities("/api/flash-deals")).rejects.toThrow(
      "Inventory connection unavailable",
    );
  });
  it("rejects HTTP failure and malformed successful rows", async () => {
    response({}, false);
    await expect(loadPriceOpportunities("/api/flash-deals")).rejects.toThrow(
      "unavailable",
    );
    response({ count: 1, state: "TX", deals: [null] });
    await expect(loadPriceOpportunities("/api/flash-deals")).rejects.toThrow();
  });
  it("preserves real card evidence and does not interpret a window as a seller deadline", async () => {
    const car = {
      id: "one",
      title: "Vehicle",
      source: "cars_com",
      askPrice: 12000,
      images: [],
      grade: "good",
      gradeLabel: "Good deal",
      discountPct: 12,
      listingCount: 1,
      alsoOn: [],
      valueAsOf: "2026-10-09",
      secondsRemaining: 500,
    };
    response({ deals: [car], count: 1, state: "TX" });
    const result = await loadPriceOpportunities("/api/flash-deals");
    expect(result.deals[0].valueAsOf).toBe("2026-10-09");
  });
});
