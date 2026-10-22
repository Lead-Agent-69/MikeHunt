import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../pipeline", () => ({ upsertDeals: vi.fn() }));
import { upsertDeals } from "../pipeline";
import { enrichAndStore } from "./shared";
import { listingPriceEvidence } from "@/lib/deals/acquisition-price";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { parseCarsComHtml } from "./cars-com";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("source persistence counts", () => {
  const row = {
    title: "2020 Ford Explorer",
    asking_price: 18000,
    location_state: "MO",
  };

  it("reports accepted rows, not rows rejected by buyer scope", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    const network = vi.fn();
    vi.stubGlobal("fetch", network);
    vi.mocked(upsertDeals).mockResolvedValueOnce(0).mockResolvedValueOnce(1);
    expect(await enrichAndStore(row)).toBe(0);
    expect(await enrichAndStore(row)).toBe(1);
    expect(network).not.toHaveBeenCalled();
  });

  it("does not count a failed write as collected inventory", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(upsertDeals).mockRejectedValueOnce(new Error("write failed"));
    expect(await enrichAndStore(row)).toBe(0);
  });

  it("never converts a current auction bid into a buy-now offer", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    vi.mocked(upsertDeals).mockResolvedValueOnce(1);
    await enrichAndStore({
      source: "iaa",
      external_id: "bid-only",
      title: "2020 Ford Explorer",
      current_bid: 5000,
    });
    const deal = vi.mocked(upsertDeals).mock.lastCall![0][0];
    expect(deal.ask_price).toBe(5000);
    expect(deal.buy_now_price).toBeUndefined();
    expect(sourcePriceContext(deal).buyNowPrice).toBeNull();
  });

  it("preserves explicit buy-now and price provenance without refreshing the observation", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    vi.mocked(upsertDeals).mockResolvedValueOnce(1);
    const priceEvidence = {
      kind: "current_bid",
      currentBid: 5000,
      buyNow: 9000,
      checkedAt: "2026-10-19T12:00:00Z",
    };
    await enrichAndStore({
      source: "iaa",
      external_id: "buy-now",
      title: "2020 Ford Explorer",
      current_bid: 5000,
      buy_now_price: 9000,
      options: { priceEvidence, sellerType: "auction" },
      title_source: "listing",
      condition: "rebuilt_title",
    });
    const deal = vi.mocked(upsertDeals).mock.lastCall![0][0];
    expect(deal.buy_now_price).toBe(9000);
    expect(deal.title_source).toBe("listing");
    expect(listingPriceEvidence(deal)).toMatchObject(priceEvidence);
  });

  it("preserves a Cars.com card's explicit price terms through storage mapping", async () => {
    vi.stubEnv("MARKETCHECK_API_KEY", "");
    vi.mocked(upsertDeals).mockResolvedValueOnce(1);
    const vehicle = {
      listingId: "cash",
      vin: "PARTIAL",
      year: 2020,
      make: "Ford",
      model: "Explorer",
      stockType: "used",
      dealerState: "MO",
      price: 999,
    };
    const details = JSON.stringify(vehicle).replace(/"/g, "&quot;");
    const [card] = parseCarsComHtml(
      `<fuse-card data-vehicle-details="${details}"><p>Down payment: $999</p><p>Cash price: $18,000</p></fuse-card>`,
      "MO",
      "2026-10-19T12:00:00Z",
    );
    await enrichAndStore(card);
    const deal = vi.mocked(upsertDeals).mock.lastCall![0][0];
    expect(listingPriceEvidence(deal)).toMatchObject({
      kind: "asking",
      askingPrice: 18000,
      listedAmount: 999,
      checkedAt: "2026-10-19T12:00:00Z",
    });
  });
});
