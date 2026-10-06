import { describe, expect, it } from "vitest";
import {
  buildSoldIndexes,
  soldTitleLane,
  summarizeCleanSold,
} from "./market-value";
import { shortSoldTitle } from "@/lib/scrapers/sources/ebay-sold";

const row = (
  price: number,
  title: string | null,
  sold_at: string,
  year = 2018,
) => ({
  make: "Honda",
  model: "Accord",
  year,
  sold_price: price,
  title,
  sold_at,
  location_state: "IL",
});

describe("sold title lanes", () => {
  it("keeps salvage wording out of the clean median", () => {
    expect(soldTitleLane("2018 Honda Accord EX")).toBe("clean");
    expect(soldTitleLane("2018 Honda Accord salvage title")).toBe("salvage");
    expect(soldTitleLane("2018 Honda Accord REBUILT")).toBe("salvage");
    expect(soldTitleLane(null)).toBe("unknown");
    expect(shortSoldTitle("  2018   Honda Accord  ")).toBe("2018 Honda Accord");
    expect(shortSoldTitle("x".repeat(200))).toHaveLength(160);

    const built = buildSoldIndexes([
      row(10000, "2018 Honda Accord EX", "2026-04-01T00:00:00.000Z"),
      row(12000, "2018 Honda Accord", "2026-04-20T00:00:00.000Z"),
      row(14000, "2019 Honda Accord LX", "2026-05-01T00:00:00.000Z", 2019),
      row(4000, "2018 Honda Accord salvage title", "2026-05-02T00:00:00.000Z"),
      row(9000, null, "2026-05-03T00:00:00.000Z"),
    ]);
    expect(Array.from(built.clean.values())[0]).toMatchObject({
      median: 12000,
      n: 3,
      soldAt: "2026-05-01T00:00:00.000Z",
    });
    expect(Array.from(built.salvage.values())[0]).toMatchObject({
      median: 4000,
      n: 1,
    });
  });

  it("does not publish a clean price at n=2, and says when salvage is mixed in", () => {
    const thin = summarizeCleanSold([
      row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
      row(14000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
    ]);
    expect(thin.median).toBeNull();
    expect(thin.count).toBe(2);
    expect(thin.soldAt).toBeNull();
    expect(thin.mixed).toBe(false);
    expect(thin.note).toMatch(/at least 3/);

    const mixed = summarizeCleanSold([
      row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
      row(14000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
      row(4000, "2018 Honda Accord flood", "2026-04-03T00:00:00.000Z"),
    ]);
    expect(mixed.median).toBeNull();
    expect(mixed.count).toBe(2);
    expect(mixed.mixed).toBe(true);
    expect(mixed.note).toMatch(/Salvage/);

    const priced = summarizeCleanSold([
      row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
      row(12000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
      row(14000, "2018 Honda Accord LX", "2026-04-28T00:00:00.000Z"),
      row(3000, "2018 Honda Accord salvage", "2026-04-29T00:00:00.000Z"),
    ]);
    expect(priced).toMatchObject({
      median: 12000,
      count: 3,
      soldAt: "2026-04-28T00:00:00.000Z",
      mixed: false,
      note: null,
    });
  });
});
