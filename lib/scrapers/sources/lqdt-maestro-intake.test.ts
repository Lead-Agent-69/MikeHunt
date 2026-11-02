import { expect, it, vi } from "vitest";
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => {
    throw new Error("Hosted clients are forbidden in this test");
  },
}));
vi.mock("@/lib/data-quality/optional-columns", () => ({
  columnsExist: async () => true,
  stripColumns: (rows: unknown[]) => rows,
}));
import { withLocalWriteContext } from "../local-write-context";
import { upsertDeals } from "../pipeline";
import { maestroAssetToDeal } from "./lqdt-maestro";

it("persists auction disclosures and gallery through the real pipeline without inventing condition or mileage", async () => {
  const persistRows = vi.fn(async () => ({
    rows: [],
    priceChangedKeys: new Set<string>(),
  }));
  const row = maestroAssetToDeal(
    {
      accountId: 24037,
      assetId: 1315,
      modelYear: "2018",
      makebrand: "Chrysler",
      model: "Pacifica",
      assetShortDesc: "2018 Chrysler Pacifica",
      assetLongDesc:
        "Title is branded Buyback<br>Not salvage or rebuilt<br>Every car must be towed.",
      vinserial: "2C4RC1FG4JR361988",
      meter: "Miles",
      meterCount: 105637,
      meterAccurate: "Unknown",
      currentBid: 5000,
      locationCity: "Jacksonville",
      locationState: "FL",
      locationZip: "32218",
      assetPhotos: Array.from(
        { length: 23 },
        (_, i) => `/photos/24037/24037_1315_photo${i}.jpg`,
      ),
    },
    { source: "gov_auction", idPrefix: "gd", defaultSeller: "GovDeals" },
  )!;
  await withLocalWriteContext(
    { cacheOnly: true, cache: { persistRows } as any, supabase: {} as any },
    () => upsertDeals([row]),
  );
  expect(persistRows).toHaveBeenCalledOnce();
  const stored = (persistRows.mock.calls[0] as any)[0][0];
  expect(stored.images).toHaveLength(20);
  expect(stored.condition).toBeNull();
  expect(stored.mileage).toBeUndefined();
  expect(stored.options).toMatchObject({
    titleType: "Buyback (seller-reported)",
    description: expect.stringContaining("must be towed"),
    reportedOdometer: { value: 105637, accuracy: "Unknown" },
    priceEvidence: { kind: "current_bid", listedAmount: 5000 },
  });
});
