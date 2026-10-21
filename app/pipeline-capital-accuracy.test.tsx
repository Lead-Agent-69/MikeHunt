import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { InventoryItem } from "@/lib/data/inventory-service";
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
vi.mock("swr", () => ({
  default: () => ({ data: { ownerId: "owner", outcomes: [] } }),
}));
import { CapitalVelocityTracker } from "@/components/fleet/CapitalVelocityTracker";

describe("capital pressure accuracy", () => {
  function render(totalCost: number) {
    const inventory = [
      {
        id: "unit",
        dealerId: "owner",
        stage: "acquired",
        totalCost,
        dailyFloorRate: 10,
        floorDate: new Date(Date.now() - 20 * 86400000),
      } as InventoryItem,
    ];
    return renderToStaticMarkup(
      <CapitalVelocityTracker inventory={inventory} />,
    );
  }
  it("shows the true carry-to-capital ratio above 100% while bounding only the visual bar", () => {
    const html = render(100);
    expect(html).toContain("200%");
    expect(html).toContain("width:100%");
    expect(html).not.toContain("width:200%");
  });
  it("keeps a ratio with zero capital unavailable instead of claiming 0% or dividing by zero", () => {
    const html = render(0);
    expect(html).toMatch(
      /Modeled Carry \/ Capital<\/span><span[^>]*>—<\/span>/,
    );
    expect(html).not.toContain("Infinity");
  });
});
