import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketVisualizers } from "@/components/market/MarketVisualizers";

describe("interactive market visualizers", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });

  it("turns chart selections into filter callbacks", () => {
    const onLaneToggle = vi.fn();
    const onPriceRangeSelect = vi.fn();
    act(() =>
      root.render(
        <MarketVisualizers
          facets={{
            priceHistogram: [{ from: 10000, to: 15000, n: 8 }],
            lanes: { auction: 8 },
            laneProfit: { auction: 2400 },
            laneColors: { auction: "#0ff" },
          }}
          selectedLanes={[]}
          selectedPrice={{ min: "", max: "" }}
          onLaneToggle={onLaneToggle}
          onPriceRangeSelect={onPriceRangeSelect}
        />,
      ),
    );

    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label*="8 listings. Apply price band"]',
        )!
        .click(),
    );
    expect(onPriceRangeSelect).toHaveBeenCalledWith(10000, 15000);

    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("auction"))!
        .click(),
    );
    expect(onLaneToggle).toHaveBeenCalledWith("auction");
  });
});
