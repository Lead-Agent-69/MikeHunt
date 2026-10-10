import { describe, expect, it } from "vitest";
import {
  SOLD_MEDIAN_WINDOW_DAYS,
  buildSoldIndexes,
  isWithinSoldWindow,
  soldTitleLane,
  summarizeCleanSold,
} from "./market-value";

// Fixed clock so the window math does not drift with the calendar.
const NOW = Date.parse("2026-05-10T00:00:00.000Z");
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
  title:
    title && !/salvage|rebuilt|flood/i.test(title)
      ? `${title}, clean title`
      : title,
  sold_at,
  location_state: "IL",
});

describe("sold title lanes", () => {
  it("keeps salvage wording out of the clean median", () => {
    expect(soldTitleLane("2018 Honda Accord EX")).toBe("unknown");
    expect(soldTitleLane("2018 Honda Accord EX, clean title")).toBe("clean");
    expect(soldTitleLane("not clean title")).toBe("unknown");
    expect(soldTitleLane("clean title unconfirmed")).toBe("unknown");
    expect(soldTitleLane("2018 Honda Accord salvage title")).toBe("salvage");
    expect(soldTitleLane("2018 Honda Accord REBUILT")).toBe("salvage");
    expect(soldTitleLane(null)).toBe("unknown");
    // Shared soldTitleCategory: hail/lemon/rebuildable are branded; "Clean Carfax" is not a title.
    expect(soldTitleLane("2018 Honda Accord hail damage")).toBe("salvage");
    expect(soldTitleLane("2018 Honda Accord lemon buyback")).toBe("salvage");
    expect(soldTitleLane("2018 Honda Accord rebuildable")).toBe("salvage");
    expect(soldTitleLane("2018 Honda Accord Clean Carfax")).toBe("unknown");
    expect(soldTitleLane("2018 Honda Accord clean title, never flooded")).toBe(
      "clean",
    );
    expect(shortSoldTitle("  2018   Honda Accord  ")).toBe("2018 Honda Accord");
    expect(shortSoldTitle("x".repeat(200))).toHaveLength(160);

    const built = buildSoldIndexes(
      [
        row(10000, "2018 Honda Accord EX", "2026-04-01T00:00:00.000Z"),
        row(12000, "2018 Honda Accord", "2026-04-20T00:00:00.000Z"),
        row(14000, "2019 Honda Accord LX", "2026-05-01T00:00:00.000Z", 2019),
        row(
          4000,
          "2018 Honda Accord salvage title",
          "2026-05-02T00:00:00.000Z",
        ),
        row(9000, null, "2026-05-03T00:00:00.000Z"),
      ],
      NOW,
    );
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
    const thin = summarizeCleanSold(
      [
        row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
        row(14000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
      ],
      NOW,
    );
    expect(thin.median).toBeNull();
    expect(thin.count).toBe(2);
    expect(thin.soldAt).toBeNull();
    expect(thin.mixed).toBe(false);
    expect(thin.note).toMatch(/at least 3/);

    const mixed = summarizeCleanSold(
      [
        row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
        row(14000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
        row(4000, "2018 Honda Accord flood", "2026-04-03T00:00:00.000Z"),
      ],
      NOW,
    );
    expect(mixed.median).toBeNull();
    expect(mixed.count).toBe(2);
    expect(mixed.mixed).toBe(true);
    expect(mixed.note).toMatch(/Salvage/);

    const priced = summarizeCleanSold(
      [
        row(10000, "2018 Honda Accord", "2026-04-01T00:00:00.000Z"),
        row(12000, "2018 Honda Accord EX", "2026-04-02T00:00:00.000Z"),
        row(14000, "2018 Honda Accord LX", "2026-04-28T00:00:00.000Z"),
        row(3000, "2018 Honda Accord salvage", "2026-04-29T00:00:00.000Z"),
      ],
      NOW,
    );
    expect(priced).toMatchObject({
      median: 12000,
      count: 3,
      soldAt: "2026-04-28T00:00:00.000Z",
      mixed: false,
      note: null,
    });
  });

  it("drops sales outside the sold-median window and says so", () => {
    expect(SOLD_MEDIAN_WINDOW_DAYS).toBe(180);
    const day = 86_400_000;
    const iso = (daysAgo: number) =>
      new Date(NOW - daysAgo * day).toISOString();
    expect(isWithinSoldWindow(iso(179), NOW)).toBe(true);
    expect(isWithinSoldWindow(iso(181), NOW)).toBe(false);
    expect(isWithinSoldWindow(null, NOW)).toBe(false);
    expect(isWithinSoldWindow("not a date", NOW)).toBe(false);
    expect(isWithinSoldWindow(iso(-3), NOW)).toBe(false);
    expect(isWithinSoldWindow(new Date(NOW + 1000).toISOString(), NOW)).toBe(
      false,
    );

    // Three clean sales, but two are over a year old: no published median.
    const stale = summarizeCleanSold(
      [
        row(10000, "2018 Honda Accord", iso(400)),
        row(12000, "2018 Honda Accord EX", iso(500)),
        row(14000, "2018 Honda Accord LX", iso(10)),
      ],
      NOW,
    );
    expect(stale.median).toBeNull();
    expect(stale.count).toBe(1);
    expect(stale.staleCount).toBe(2);
    expect(stale.windowDays).toBe(180);

    const allOld = summarizeCleanSold(
      [
        row(10000, "2018 Honda Accord", iso(400)),
        row(12000, "2018 Honda Accord EX", iso(401)),
        row(14000, "2018 Honda Accord LX", iso(402)),
      ],
      NOW,
    );
    expect(allOld.median).toBeNull();
    expect(allOld.note).toMatch(/last 180 days/);

    const built = buildSoldIndexes(
      [
        row(10000, "2018 Honda Accord", iso(400)),
        row(12000, "2018 Honda Accord EX", iso(20)),
        row(14000, "2018 Honda Accord LX", iso(30)),
        row(16000, "2018 Honda Accord LX", iso(40)),
      ],
      NOW,
    );
    expect(Array.from(built.clean.values())[0]).toMatchObject({
      median: 14000,
      n: 3,
    });
  });
  it("excludes nonfinite prices and unreported title brands from the backend sample", () => {
    const rows = [
      row(10000, "2018 Honda Accord", "2026-04-01T00:00:00Z"),
      row(Infinity, "2018 Honda Accord", "2026-04-02T00:00:00Z"),
      {
        ...row(14000, "2018 Honda Accord", "2026-04-03T00:00:00Z"),
        title: "2018 Honda Accord EX",
      },
    ];
    expect(summarizeCleanSold(rows, NOW)).toMatchObject({
      median: null,
      count: 1,
      unknownCount: 1,
    });
    expect(Array.from(buildSoldIndexes(rows, NOW).clean.values())[0].n).toBe(1);
  });
});
