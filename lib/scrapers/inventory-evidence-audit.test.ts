import { describe, expect, it } from "vitest";
import {
  inventoryIdentityAudit,
  type InventoryEvidenceRow,
} from "./inventory-evidence-audit";

const row = (
  id: string | undefined,
  url: string | undefined,
  source: InventoryEvidenceRow["source"] = "cars_com",
  images: string[] = ["https://images.example/car.jpg"],
): InventoryEvidenceRow => ({
  source,
  source_deal_id: id,
  source_url: url,
  images,
  options: { aggregator: "autotempest" },
});

describe("inventory identity evidence", () => {
  it("reports canonical URL collisions without exposing listing identity", () => {
    const report = inventoryIdentityAudit([
      row("at-one", "https://www.cars.com/vehicle/1/?utm_source=a"),
      row("at-two", "https://www.cars.com/vehicle/1?gclid=b"),
      row("at-three", "https://www.cars.com/vehicle/2", "cars_com", [
        "https://images.example/front.jpg",
        "https://images.example/rear.jpg",
      ]),
    ]);

    expect(report).toMatchObject({
      rows: 3,
      identityGroups: 2,
      collisionGroups: 1,
      duplicateRows: 1,
      missingIdentityRows: 0,
      bySource: {
        cars_com: {
          rows: 3,
          identityGroups: 2,
          collisionGroups: 1,
          duplicateRows: 1,
          usablePhotoRows: 3,
          multiPhotoRows: 1,
        },
      },
    });
    expect(JSON.stringify(report)).not.toContain("cars.com/vehicle");
  });

  it("keeps source boundaries and meaningful query variants separate", () => {
    const report = inventoryIdentityAudit([
      row("at-cars", "https://market.example/item/1", "cars_com"),
      row("at-ebay", "https://market.example/item/1", "ebay_motors"),
      row(
        "at-blue",
        "https://www.ebay.com/itm/123?variation=blue",
        "ebay_motors",
      ),
      row(
        "at-red",
        "https://www.ebay.com/itm/123?variation=red",
        "ebay_motors",
      ),
    ]);

    expect(report.collisionGroups).toBe(0);
    expect(report.duplicateRows).toBe(0);
    expect(report.identityGroups).toBe(4);
  });

  it("excludes non-aggregator rows and reports missing fallback identities", () => {
    const direct = row("direct", "https://dealer.example/1");
    direct.options = { aggregator: "direct" };
    const report = inventoryIdentityAudit([
      direct,
      row(undefined, undefined),
      row("at-safe", undefined),
    ]);

    expect(report).toMatchObject({
      rows: 2,
      identityGroups: 1,
      missingIdentityRows: 1,
    });
  });
});
