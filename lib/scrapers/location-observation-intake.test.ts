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

it("clears obsolete branch coordinates at persistence only for a matching vehicle-location observation", async () => {
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
    location_city: "Port Charlotte",
    location_state: "FL",
    location_zip: "33952",
    images: ["https://dealer.test/actual-vehicle.jpg"],
    options: { priceEvidence: { kind: "asking", askingPrice: 9000 } },
  };
  const observation = { sourceUrl: deal.source_url, resetCoordinates: true };
  for (const extra of [
    { options: { ...deal.options, vehicleLocation: observation } },
    {
      options: {
        ...deal.options,
        vehicleLocation: {
          ...observation,
          sourceUrl: "https://other.test/car",
        },
      },
    },
    {
      lat: 26.976,
      lng: -82.09,
      options: { ...deal.options, vehicleLocation: observation },
    },
  ])
    await withLocalWriteContext(context, () =>
      upsertDeals([{ ...deal, ...extra } as any]),
    );
  const rows = persistRows.mock.calls.map((call) => (call as any)[0][0]);
  expect(rows[0]).toMatchObject({
    lat: null,
    lng: null,
    location_city: "Port Charlotte",
  });
  expect(rows[1]).not.toHaveProperty("lat");
  expect(rows[1]).not.toHaveProperty("lng");
  expect(rows[2]).toMatchObject({ lat: 26.976, lng: -82.09 });
});
