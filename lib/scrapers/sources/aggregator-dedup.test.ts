import { describe, expect, it } from "vitest";
import { canonicalListingUrl, dropKnownListings } from "./aggregator-dedup";

function fakeSb(rows: { vin?: string; source_url?: string }[]) {
  return {
    from: () => ({
      select: (col: string) => ({
        in: async (_c: string, values: string[]) => ({
          data: rows.filter((r) => values.includes((r as any)[col])),
          error: null,
        }),
      }),
    }),
  } as never;
}

describe("aggregator dedup", () => {
  it("canonicalises origin URLs (no query, hash, www or trailing slash)", () => {
    expect(canonicalListingUrl("https://www.cars.com/vehicledetail/123/?utm=x#a")).toBe(
      "https://cars.com/vehicledetail/123",
    );
    expect(canonicalListingUrl("javascript:alert(1)")).toBe("");
  });

  it("drops rows whose VIN or origin URL we already hold, and in-batch duplicates", async () => {
    const sb = fakeSb([
      { vin: "1C4RJFN91MC817769" },
      { source_url: "https://www.cars.com/vehicledetail/1" },
    ]);
    const { fresh, dropped } = await dropKnownListings(
      [
        { vin: "1c4rjfn91mc817769", source_url: "https://dealer.example/a" },
        { vin: "1FTFW1E50JFA00001", source_url: "https://www.cars.com/vehicledetail/1" },
        { vin: "1HGCM82633A004352", source_url: "https://dealer.example/b" },
        { vin: "1HGCM82633A004352", source_url: "https://dealer.example/b2" },
        { source_url: "https://dealer.example/c?x=1" },
        { source_url: "https://www.dealer.example/c/" },
      ],
      sb,
    );
    expect(fresh.map((d) => d.source_url)).toEqual([
      "https://dealer.example/b",
      "https://dealer.example/c?x=1",
    ]);
    expect(dropped).toBe(4);
  });

  it("keeps everything when no database is configured (cache-only runs)", async () => {
    const rows = [{ vin: "1HGCM82633A004352" }];
    expect((await dropKnownListings(rows, null)).fresh).toHaveLength(1);
  });
});
