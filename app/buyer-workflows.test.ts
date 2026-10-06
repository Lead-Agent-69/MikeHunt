import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const result = vi.hoisted(() => ({
  data: undefined as unknown,
  error: undefined as unknown,
  isLoading: false,
}));
vi.mock("swr", () => ({ default: () => ({ ...result, mutate: vi.fn() }) }));
import { VehicleComparison } from "@/components/saved/VehicleComparison";
import { PurchasePipeline } from "@/components/saved/PurchasePipeline";

beforeEach(() => {
  result.data = undefined;
  result.error = undefined;
  result.isLoading = false;
});

describe("personal buyer workflows", () => {
  it("compares actual vehicles without treating unknown costs as a confirmed all-in price", () => {
    result.data = [
      { id: "one", year: 2019, make: "Honda", model: "Civic", askPrice: 5980 },
      { id: "two", year: 2020, make: "Ford", model: "Explorer" },
    ];
    const html = renderToStaticMarkup(
      React.createElement(VehicleComparison, { ids: ["one", "two"] }),
    );
    expect(html).toContain("Honda");
    expect(html).toContain("Explorer");
    expect(html).toContain("$5,980");
    expect(html).toContain("Not confirmed");
    expect(html).toContain("Incomplete: verify fees");
    expect(html).not.toContain("Profit");
  });

  it("retains unavailable saves in purchase planning but excludes archived records", () => {
    result.data = [
      {
        id: "one",
        deal_id: "deal-one",
        status: "unavailable",
        tags: [],
        snapshot: { make: "Honda", model: "Civic" },
      },
      {
        id: "two",
        deal_id: "deal-two",
        status: "archived",
        snapshot: { make: "Ford", model: "Focus" },
      },
    ];
    const html = renderToStaticMarkup(React.createElement(PurchasePipeline));
    expect(html).toContain("Retained for your records");
    expect(html).toContain("independent inspection");
    expect(html).not.toContain("Focus");
    expect(html).not.toContain("profit");
  });

  it("does not turn failed comparison requests into empty success", () => {
    result.error = new Error("database detail must stay private");
    const html = renderToStaticMarkup(
      React.createElement(VehicleComparison, { ids: ["one", "two"] }),
    );
    expect(html).toContain("compare these vehicles");
    expect(html).not.toContain("database detail");
  });
});
