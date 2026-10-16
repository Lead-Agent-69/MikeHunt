import { describe, expect, it } from "vitest";
import { sortInventoryResults } from "./sort-inventory-results";

const rows = [
  {
    id: "old",
    year: 2015,
    mileage: 90000,
    askPrice: 5000,
    profitEstimate: 8000,
    firstSeenAt: "2026-10-01",
    trustExplanation: { score: 60 },
  },
  {
    id: "new",
    year: 2023,
    mileage: 10000,
    askPrice: 15000,
    profitEstimate: 1000,
    firstSeenAt: "2026-10-15",
    trustExplanation: { score: 90 },
  },
];
describe("inventory result ordering", () => {
  it.each([
    ["year", "new"],
    ["mileage", "new"],
    ["newest", "new"],
    ["price", "old"],
    ["price-desc", "new"],
    ["profit", "old"],
    ["score", "new"],
  ])("honors %s instead of replacing it with profit", (sort, id) => {
    expect(sortInventoryResults(rows, sort)[0].id).toBe(id);
    expect(rows[0].id).toBe("old");
  });
  it("puts absent and invalid facts last, while retaining genuine zero mileage and losses", () => {
    const missing = {
      id: "missing",
      askPrice: 0,
      mileage: NaN,
      firstSeenAt: "invalid",
    };
    expect(sortInventoryResults([missing, ...rows], "price").at(-1)?.id).toBe(
      "missing",
    );
    expect(sortInventoryResults([missing, ...rows], "newest").at(-1)?.id).toBe(
      "missing",
    );
    expect(
      sortInventoryResults([missing, { id: "zero", mileage: 0 }], "mileage")[0]
        .id,
    ).toBe("zero");
    expect(
      sortInventoryResults(
        [{ id: "unknown" }, { id: "loss", profitEstimate: -100 }],
        "profit",
      )[0].id,
    ).toBe("loss");
  });
});
