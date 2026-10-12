import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryDetailFilters } from "@/components/search/InventoryDetailFilters";
import {
  INVENTORY_DETAIL_FIELDS,
  SCAN_EXTRA_KEYS,
} from "@/lib/search/extended-inventory-filters";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe("organized inventory detail controls", () => {
  it("labels every field and groups specifications, auction and evidence filters", () => {
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          values: {},
          onChange: () => {},
        }),
      ),
    );
    expect(host.querySelectorAll("fieldset")).toHaveLength(4);
    expect(
      host.querySelector('fieldset[aria-label="Price & mileage evidence"]'),
    ).not.toBeNull();
    for (const field of INVENTORY_DETAIL_FIELDS) {
      const control = host.querySelector(`[aria-label="${field.label}"]`);
      expect(control).not.toBeNull();
      expect(control?.classList.contains("min-h-11")).toBe(true);
    }
    expect(host.textContent).toContain("Not reported");
    expect(host.textContent).toContain("Auction end date to (UTC)");
  });

  it("keeps advanced groups collapsed in the compact rail", () => {
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          compact: true,
          values: {},
          onChange: () => {},
        }),
      ),
    );
    expect(
      Array.from(host.querySelectorAll("details")).every(
        (detail) => !detail.open,
      ),
    ).toBe(true);
  });

  it("collapses unused groups on desktop while exposing selected evidence", () => {
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          values: { runDrive: "unknown", hasPhotos: "yes" },
          onChange: () => {},
        }),
      ),
    );
    const groups = Array.from(host.querySelectorAll("details"));
    expect(groups.map((group) => group.open)).toEqual([
      false,
      false,
      true,
      true,
    ]);
    expect(groups[2].querySelector("summary")?.textContent).toContain(
      "Run & drive reported: Not reported",
    );
    expect(groups[3].querySelector("summary")?.textContent).toContain(
      "Photos: Available",
    );
  });

  it("clears only selected visible fields, preserving hidden filters", () => {
    const change = vi.fn();
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          keys: ["runDrive", "minBuyNow", "maxBuyNow"],
          values: {
            runDrive: "unknown",
            minBuyNow: "0",
            maxBuyNow: "5000",
            damage: "front",
            city: "St. Louis",
          },
          onChange: change,
        }),
      ),
    );
    const reset = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Clear condition & auction filters"]',
    )!;
    expect(reset.title).toBe("Clear condition & auction filters");
    act(() => reset.click());
    expect(change.mock.calls).toEqual([
      ["runDrive", ""],
      ["minBuyNow", ""],
      ["maxBuyNow", ""],
    ]);
  });

  it("does not count the all sentinel as an active filter", () => {
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          values: { city: "all" },
          onChange: () => {},
        }),
      ),
    );
    expect(host.querySelectorAll("button")).toHaveLength(0);
    expect(host.textContent).not.toContain("selected");
  });

  it("renders only Scan's additional fields without duplicating legacy filters", () => {
    const change = vi.fn();
    act(() =>
      root.render(
        React.createElement(InventoryDetailFilters, {
          keys: SCAN_EXTRA_KEYS,
          values: { runDrive: "no" },
          onChange: change,
        }),
      ),
    );
    expect(host.querySelectorAll("input, select")).toHaveLength(
      SCAN_EXTRA_KEYS.length,
    );
    expect(host.querySelector('[aria-label="Keys present"]')).toBeNull();
    const select = host.querySelector<HTMLSelectElement>(
      '[aria-label="Run & drive reported"]',
    )!;
    expect(select.value).toBe("no");
    act(() => {
      select.value = "unknown";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(change).toHaveBeenCalledWith("runDrive", "unknown");
  });
});
