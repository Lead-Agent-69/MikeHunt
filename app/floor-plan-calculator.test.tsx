import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FloorPlanCalculator } from "@/components/deal/FloorPlanCalculator";

describe("floor plan calculator", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root.render(
        <FloorPlanCalculator purchasePrice={10000} expectedProfit={5000} />,
      ),
    );
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("uses editable assumptions instead of hard-coded lender claims", () => {
    expect(host.textContent).toContain("Editable deal assumptions");
    expect(host.textContent).not.toContain("NextGear");
    expect(host.textContent).not.toContain("Westlake");
    expect(
      host.querySelector(
        '[aria-label="Projected profit remaining over 90 days"]',
      ),
    ).not.toBeNull();

    act(() =>
      Simulate.change(host.querySelector('[aria-label="APR"]')!, {
        target: { value: "0" },
      } as never),
    );
    act(() =>
      Simulate.change(
        host.querySelector('[aria-label="Opening / audit fees"]')!,
        { target: { value: "0" } } as never,
      ),
    );
    expect(host.textContent).toContain("$5,000");
  });
});
