import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MarketFacetStudio,
  type MarketFacetKey,
} from "@/components/market/MarketFacetStudio";
import {
  MarketResultsMap,
  marketMapPoints,
} from "@/components/market/MarketResultsMap";
import type { MarketListing } from "@/lib/market/explorer";

describe("smart market exploration", () => {
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

  it("turns matrix cells and live facet bars into search actions", () => {
    const onFacetSelect = vi.fn<(key: MarketFacetKey, value: string) => void>();
    const onMatrixSelect = vi.fn();
    act(() =>
      root.render(
        <MarketFacetStudio
          total={42}
          selected={{}}
          facets={{
            topMakes: [{ make: "Ford", n: 20 }],
            topModels: [{ value: "F-150", n: 12 }],
            years: [{ value: "2024", n: 8 }],
            conditions: [{ value: "clean_title", n: 30 }],
            priceBands: [{ from: 10_000, to: 19_999, label: "$10k–$20k" }],
            mileageBands: [{ from: 25_000, to: 49_999, label: "25k–50k" }],
            priceMileageMatrix: [
              {
                priceFrom: 10_000,
                priceTo: 19_999,
                mileageFrom: 25_000,
                mileageTo: 49_999,
                n: 7,
              },
            ],
            priceKinds: [{ value: "asking", n: 25 }],
            mapped: 31,
            missingPrice: 2,
            missingMileage: 3,
          }}
          onFacetSelect={onFacetSelect}
          onMatrixSelect={onMatrixSelect}
        />,
      ),
    );

    act(() =>
      host
        .querySelector<HTMLButtonElement>(
          '[aria-label="$10k–$20k, 25k–50k: 7 listings"]',
        )!
        .click(),
    );
    expect(onMatrixSelect).toHaveBeenCalledWith(10_000, 19_999, 25_000, 49_999);

    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent === "Vehicle")!
        .click(),
    );
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Ford"))!
        .click(),
    );
    expect(onFacetSelect).toHaveBeenCalledWith("make", "Ford");

    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent === "Auction")!
        .click(),
    );
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent?.includes("Clean Title"))!
        .click(),
    );
    expect(onFacetSelect).toHaveBeenCalledWith("condition", "clean_title");
  });

  it("phone range controls preserve the other axis and open-ended bounds", () => {
    const onMatrixSelect = vi.fn();
    act(() =>
      root.render(
        <MarketFacetStudio
          total={3}
          selected={{
            priceMin: "10000",
            priceMax: "19999",
            mileageMin: "25000",
            mileageMax: "49999",
          }}
          facets={{
            priceBands: [
              { from: 10000, to: 19999, label: "$10k–$20k" },
              { from: 20000, to: null, label: "$20k+" },
            ],
            mileageBands: [
              { from: 25000, to: 49999, label: "25k–50k" },
              { from: 50000, to: null, label: "50k+" },
            ],
          }}
          onFacetSelect={vi.fn()}
          onMatrixSelect={onMatrixSelect}
        />,
      ),
    );
    const selects = host.querySelectorAll("select");
    act(() => {
      selects[0].value = "20000";
      selects[0].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onMatrixSelect).toHaveBeenLastCalledWith(20000, null, 25000, 49999);
    act(() => {
      selects[1].value = "50000";
      selects[1].dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onMatrixSelect).toHaveBeenLastCalledWith(10000, 19999, 50000, null);
  });

  it("keeps source brands recognizable and their filter values unchanged", () => {
    const onFacetSelect = vi.fn();
    act(() =>
      root.render(
        <MarketFacetStudio
          total={3}
          selected={{}}
          facets={{
            sources: [
              { value: "cargurus", n: 2 },
              { value: "cars_com", n: 1 },
            ],
          }}
          onFacetSelect={onFacetSelect}
          onMatrixSelect={vi.fn()}
        />,
      ),
    );
    act(() =>
      Array.from(host.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent === "Sources")!
        .click(),
    );
    const source = Array.from(
      host.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("CarGurus"));
    expect(source).toBeDefined();
    expect(host.textContent).toContain("Cars.com");
    act(() => source!.click());
    expect(onFacetSelect).toHaveBeenCalledWith("source", "cargurus");
  });

  it("lets a user inspect mapped listings and open the selected result", () => {
    const listing = (
      id: string,
      title: string,
      mapLng: number,
    ): MarketListing => ({
      id,
      title,
      source: "cargurus",
      year: 2024,
      make: "Ford",
      model: "Maverick",
      askPrice: 24_500,
      price: {
        kind: "asking",
        label: "Asking price",
        amount: 24_500,
        advertisedAmount: 24_500,
        cashPrice: 24_500,
        buyNowPrice: null,
        comparisonEligible: true,
        evidenceCurrent: true,
        observationCurrent: true,
        canCompareToAskingCurve: true,
      },
      images: [],
      mapLat: 38.6,
      mapLng,
      locationCity: "St. Louis",
      locationState: "MO",
      lane: "clean-retail",
      profitEstimate: 2_000,
      profitScore: 70,
    });
    const negative = {
      ...listing("loss", "Loss", -90.2),
      profitEstimate: -1500,
    };
    const zero = { ...listing("zero", "Zero", -90.2), profitEstimate: 0 };
    const unknown = {
      ...listing("unknown", "Unknown", -90.2),
      profitEstimate: undefined,
    };
    const profitPoints = marketMapPoints([negative, zero, unknown], "profit");
    expect(profitPoints.map((point) => point.valueText)).toEqual([
      "-$1,500",
      "$0",
      "Unavailable",
    ]);
    expect(profitPoints.every((point) => point.price == null)).toBe(true);
    expect(
      profitPoints.every(
        (point) => point.priceLabel === "Estimated net profit",
      ),
    ).toBe(true);
    expect(
      marketMapPoints(
        [{ ...listing("mixed", "Mixed market", -90.2), lane: "marketplace" }],
        "inventory",
      )[0].type,
    ).toBe("marketplace");
    act(() =>
      root.render(
        <MarketResultsMap
          rows={[
            {
              ...listing("one", "First truck", -90.2),
              images: ["https://photos.test/one.jpg"],
            },
            {
              ...listing("two", "Second truck", -87.6),
              images: ["https://photos.test/two.jpg"],
            },
          ]}
          flipDesk
        />,
      ),
    );
    act(() => {
      const select = host.querySelector<HTMLSelectElement>(
        '[aria-label="Inspect mapped listing"]',
      )!;
      select.value = "two";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const link = host.querySelector<HTMLAnchorElement>('a[href="/deal/two"]');
    expect(link?.textContent).toContain("Review listing");
    expect(host.textContent).toContain("Second truck");
    expect(
      host.querySelector('img[alt="Second truck"]')?.getAttribute("src"),
    ).toContain("two.jpg");
  });
});
