import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => {
    throw new Error("No hosted client allowed in this test");
  },
}));
vi.mock("@/lib/data-quality/optional-columns", () => ({
  columnsExist: async () => true,
  stripColumns: (rows: unknown[]) => rows,
}));
import { withLocalWriteContext } from "./local-write-context";
import { upsertDeals } from "./pipeline";

it("passes a placeholder-only source record to the local persistence boundary without awarding photo completeness", async () => {
  const persistRows = vi.fn(async () => ({
    rows: [],
    priceChangedKeys: new Set<string>(),
  }));
  const context = {
    cacheOnly: true,
    cache: { persistRows } as any,
    supabase: {} as any,
  };
  const deal = {
    source: "independent_dealer" as const,
    source_url: "https://dealer.test/2020-ford-focus",
    title: "2020 Ford Focus",
    year: 2020,
    make: "Ford",
    model: "Focus",
    ask_price: 9000,
    mileage: 50000,
    condition: "clean_title",
    location_city: "St Louis",
    location_state: "MO",
    options: { priceEvidence: { kind: "asking", askingPrice: 9000 } },
    images: ["https://dealer.test/no-photo.jpg"],
  };
  await withLocalWriteContext(context, () => upsertDeals([deal as any]));
  expect(persistRows).toHaveBeenCalledTimes(1);
  const placeholderRow = (persistRows.mock.calls[0] as any)[0][0];
  expect(placeholderRow.images).toEqual(deal.images);
  expect(placeholderRow.options.photoAudit).toMatchObject({
    state: "placeholder",
    placeholderUrls: deal.images,
    originalImages: deal.images,
    method: "known_url_fingerprint",
  });
  expect(placeholderRow.source_url).toBe(deal.source_url);
  await withLocalWriteContext(context, () =>
    upsertDeals([
      { ...deal, images: ["https://dealer.test/actual-vehicle.jpg"] } as any,
    ]),
  );
  const genuineRow = (persistRows.mock.calls[1] as any)[0][0];
  expect(genuineRow.completeness - placeholderRow.completeness).toBe(25);
  expect(genuineRow.options.photoAudit).toBeUndefined();
});
