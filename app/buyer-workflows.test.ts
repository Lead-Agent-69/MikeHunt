import React, { act } from "react";
import { createRoot } from "react-dom/client";
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
    result.data = {
      cars: [
        {
          id: "one",
          year: 2019,
          make: "Honda",
          model: "Civic",
          askPrice: 5980,
        },
        { id: "two", year: 2020, make: "Ford", model: "Explorer" },
      ],
      failed: 0,
    };
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

  it("offers a discovery entry point when the purchase plan is empty", () => {
    result.data = [];
    const html = renderToStaticMarkup(React.createElement(PurchasePipeline));
    expect(html).toContain("Purchase plan");
    expect(html).toContain('href="/discover"');
    expect(html).toContain("Find a vehicle");
  });

  it("compares price types, location, missing prices and reports without hiding the source", () => {
    result.data = {
      cars: [
        {
          id: "one",
          source: "copart",
          askPrice: 4500,
          locationCity: "Dallas",
          locationState: "TX",
          runAndDrive: false,
          hasKeys: true,
          sourceUrl: "https://www.copart.com/lot/123",
        },
        {
          id: "two",
          source: "independent_dealer",
          askPrice: 0,
          lastSeenAt: "invalid",
        },
      ],
      failed: 0,
    };
    const html = renderToStaticMarkup(
      React.createElement(VehicleComparison, { ids: ["one", "two"] }),
    );
    expect(html).toContain("Current bid");
    expect(html).toContain("Asking price");
    expect(html).toContain("Dallas, TX");
    expect(html).toContain("Reported no");
    expect(html).toContain("Reported yes");
    expect(html).toContain("Original listing");
    expect(html).toContain("Not reported");
    expect(html).not.toContain("$0");
    expect(html).not.toContain("Invalid Date");
  });

  it("explains empty stage filters and restores the checklist without losing saves", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    result.data = [
      {
        id: "one",
        deal_id: "deal-one",
        status: "saved",
        tags: ["purchase-stage:invalid"],
        snapshot: {},
      },
    ];
    const host = document.createElement("div");
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(PurchasePipeline)));
      expect(host.textContent).toContain("Saved vehicle");
      const filter = host.querySelector<HTMLSelectElement>(
        "#purchase-stage-filter",
      )!;
      await act(async () => {
        filter.value = "Inspecting";
        filter.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(host.textContent).toContain("No vehicles in inspecting.");
      expect(host.querySelector('a[href="/deal/deal-one"]')).toBeNull();
      await act(async () =>
        Array.from(host.querySelectorAll("button"))
          .find((b) => b.textContent === "Show all stages")!
          .click(),
      );
      expect(filter.value).toBe("All stages");
      expect(host.querySelector('a[href="/deal/deal-one"]')).not.toBeNull();
    } finally {
      act(() => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
