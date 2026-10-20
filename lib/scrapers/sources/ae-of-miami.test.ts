import { describe, expect, it } from "vitest";
import {
  aeDetailLimit,
  aeDetailWindow,
  aeMaxPages,
  aePageDelayMs,
  parseAeOfMiamiPage,
} from "./index";

describe("A&E of Miami inventory adapter", () => {
  it("maps explicit asking-price provenance and stable source identity", () => {
    const page = parseAeOfMiamiPage(
      {
        data: [
          {
            id: "vehicle-1",
            slug: "2022-ford-explorer-vehicle-1",
            name: "2022 Ford Explorer",
            url: "https://aeofmiami.com/product/2022-ford-explorer-vehicle-1",
            price: "19,980",
            year: 2022,
            make: "Ford",
            model: "Explorer",
            trim: "XLT",
            mileage: "54,124 miles",
            title_status: "Salvage",
            damage_type: "Front end",
            is_sold: false,
            is_on_hold: false,
            location: { name: "Miami, FL", city: "Miami" },
            main_image: { large: "https://images.example/vehicle-1.jpg" },
          },
        ],
        meta: { last_page: 17 },
      },
      "2026-10-20T00:00:00.000Z",
    );

    expect(page).toMatchObject({ rowCount: 1, lastPage: 17 });
    expect(page.deals).toHaveLength(1);
    expect(page.deals[0]).toMatchObject({
      source: "independent_dealer",
      source_deal_id: "ae-of-miami-vehicle-1",
      ask_price: 19_980,
      mileage: 54_124,
      condition: "salvage_title",
      damage_type: "Front end",
      seller: "A&E of Miami",
      seller_type: "dealer",
      location_city: "Miami",
      location_state: "FL",
      options: {
        sourceAdapterId: "ae-of-miami",
        priceEvidence: {
          kind: "asking",
          askingPrice: 19_980,
          listedAmount: 19_980,
          checkedAt: "2026-10-20T00:00:00.000Z",
        },
      },
    });
    expect(page.deals[0]).not.toHaveProperty("runs_drives");
  });

  it("excludes sold, held, unpriced and identity-free rows", () => {
    const base = {
      id: "ok",
      slug: "2024-honda-pilot-ok",
      name: "2024 Honda Pilot",
      price: "18,980",
      location: { name: "Denver, CO", city: "Denver" },
    };
    const page = parseAeOfMiamiPage({
      data: [
        { ...base, id: "sold", is_sold: true },
        { ...base, id: "held", is_on_hold: 1 },
        { ...base, id: "held-text", is_on_hold: "true" },
        { ...base, id: "held-number-text", is_on_hold: "1" },
        { ...base, id: "held-yes", is_on_hold: "yes" },
        { ...base, id: "free", price: "0" },
        { ...base, id: null, slug: null },
        base,
      ],
      meta: { last_page: "not-a-page" },
    });
    expect(page).toMatchObject({ rowCount: 8, lastPage: 1 });
    expect(page.deals.map((deal) => deal.source_deal_id)).toEqual([
      "ae-of-miami-ok",
    ]);
    expect(page.deals[0].location_state).toBe("CO");
  });

  it("bounds page coverage and request pacing", () => {
    expect(aeMaxPages(undefined)).toBe(20);
    expect(aeMaxPages("17")).toBe(17);
    expect(aeMaxPages("999")).toBe(30);
    expect(aeMaxPages("invalid")).toBe(20);
    expect(aePageDelayMs(undefined)).toBe(1_000);
    expect(aePageDelayMs("0")).toBe(250);
    expect(aePageDelayMs("9000")).toBe(5_000);
    expect(aeDetailLimit(undefined)).toBe(48);
    expect(aeDetailLimit("0")).toBe(0);
    expect(aeDetailLimit("999")).toBe(100);
    expect(aeDetailLimit("invalid")).toBe(48);
  });

  it("rotates bounded detail enrichment across inventory days", () => {
    const rows = Array.from({ length: 10 }, (_, id) => id);
    expect(aeDetailWindow(rows, 4, 0)).toEqual([0, 1, 2, 3]);
    expect(aeDetailWindow(rows, 4, 86_400_000)).toEqual([4, 5, 6, 7]);
    expect(aeDetailWindow(rows, 4, 2 * 86_400_000)).toEqual([8, 9, 0, 1]);
    expect(aeDetailWindow(rows, 0, 0)).toEqual([]);
  });
});
