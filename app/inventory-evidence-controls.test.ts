import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InventoryDetailFilters } from "@/components/search/InventoryDetailFilters";
import {
  readInventoryDetails,
  SCAN_EXTRA_KEYS,
} from "@/lib/search/extended-inventory-filters";
let root: Root;
let host: HTMLDivElement;
function Filters() {
  const [values, setValues] = useState<Record<string, string>>({});
  return React.createElement(InventoryDetailFilters, {
    keys: ["pricePolicy", "mileagePolicy"],
    values,
    onChange: (key, value) =>
      setValues((current) => ({ ...current, [key]: value })),
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("inventory evidence controls", () => {
  it("has explicit policies, labeled controls and reversible defaults", () => {
    act(() => root.render(React.createElement(Filters)));
    const price = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Price availability"]',
    )!;
    const mileage = host.querySelector<HTMLSelectElement>(
      'select[aria-label="Mileage availability"]',
    )!;
    expect(price.options[0].textContent).toBe("Follow range filters");
    expect(Array.from(price.options).map((option) => option.value)).toEqual([
      "",
      "reported",
      "include",
      "unknown",
    ]);
    act(() => {
      price.value = "include";
      price.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(price.value).toBe("include");
    expect(mileage.value).toBe("");
    act(() => {
      price.value = "";
      price.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(price.value).toBe("");
  });
  it("round-trips policies in the same detail contract as shared and saved searches", () => {
    expect(
      readInventoryDetails(
        new URLSearchParams("pricePolicy=include&mileagePolicy=unknown"),
        SCAN_EXTRA_KEYS,
      ),
    ).toEqual({ pricePolicy: "include", mileagePolicy: "unknown" });
  });
});
