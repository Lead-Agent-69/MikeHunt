import { describe, it, expect } from "vitest";
import {
  parseEbaySoldHtml,
  parseSoldLocationState,
  splitSoldMakeModelTrim,
} from "./ebay-sold";

const card = (
  title: string,
  price: string,
  id: string,
  sold = "Sold  Apr 28, 2026",
  sub = "",
) => `
<div class="s-card">
  <div class="s-card__title"><span class="su-styled-text">${title}</span></div>
  <span class="s-card__price">${price}</span>
  <a class="s-card__link" href="https://www.ebay.com/itm/${id}?hash=x"></a>
  <div class="s-card__subtitle">${sub}</div>
  <div class="s-card__caption">${sold}</div>
</div>`;

describe("parseEbaySoldHtml", () => {
  it("rejects unsold, hidden-offer, ambiguous and non-USD prices", () => {
    expect(
      parseEbaySoldHtml(
        card("2020 Acura MDX", "$3,000", "20", "Completed") +
          card(
            "2020 Acura MDX",
            "$3,000",
            "21",
            "Sold Apr 28, 2026 Best offer accepted",
          ) +
          card("2020 Acura MDX", "$3,000 to $4,000", "22") +
          card("2020 Acura MDX", "C $3,000", "23") +
          card("2020 Acura MDX", "$3,000", "24", "Sold Xxx 28, 2026"),
      ),
    ).toEqual([]);
  });
  it("ignores invalid and foreign item links without discarding valid cards", () => {
    const invalid = card("2020 Acura MDX", "$3,000", "25").replace(
      "https://www.ebay.com/itm/25?hash=x",
      "https://[",
    );
    const foreign = card("2020 Acura MDX", "$3,000", "26").replace(
      "www.ebay.com",
      "example.com",
    );
    expect(
      parseEbaySoldHtml(
        invalid + foreign + card("2020 Acura MDX", "$3,000", "27"),
      ),
    ).toHaveLength(1);
  });
  it("parses a sold vehicle: real sold price + sold date + mileage", () => {
    const rows = parseEbaySoldHtml(
      card(
        "2018 Honda Accord EX-L",
        "$18,600.00",
        "123",
        "Sold  Apr 28, 2026",
        "98,000 miles",
      ),
    );
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.source).toBe("ebay_motors");
    expect(r.year).toBe(2018);
    expect(r.make).toBe("Honda");
    expect(r.sold_price).toBe(18600);
    expect(r.mileage).toBe(98000);
    expect(r.item_id).toBe("123");
    expect(r.sold_at?.slice(0, 10)).toBe("2026-04-28");
    expect(r.title).toBe("2018 Honda Accord EX-L");
  });

  it("filters out parts/project junk and out-of-range prices", () => {
    const html =
      card("2018 Honda Accord Engine Motor 2.4L", "$900.00", "1") + // parts keyword
      card("Ford F150 Tailgate Door Panel", "$300.00", "2") + // no year + parts
      card("2002 Honda Accord", "$200.00", "3") + // too cheap
      card("2015 Ford F150 XLT 4x4", "$24,500.00", "4");
    const rows = parseEbaySoldHtml(html);
    expect(rows).toHaveLength(1);
    expect(rows[0].item_id).toBe("4");
    expect(rows[0].make).toBe("Ford");
  });

  it("dedupes repeated item ids; never throws on junk", () => {
    const dup =
      card("2016 Jeep Wrangler", "$26,000", "9") +
      card("2016 Jeep Wrangler", "$26,000", "9");
    expect(parseEbaySoldHtml(dup)).toHaveLength(1);
    expect(parseEbaySoldHtml("<html>nope</html>")).toEqual([]);
    expect(parseEbaySoldHtml("")).toEqual([]);
  });

  it("stores the normalized model and the trim separately", () => {
    const rows = parseEbaySoldHtml(
      card("2018 Ford F-150 XLT SuperCrew 4x4", "$24,500.00", "40") +
        card("2017 Honda Civic EX Sedan", "$14,200.00", "41"),
    );
    expect(rows.map((r) => [r.make, r.model, r.trim])).toEqual([
      ["Ford", "f150", "XLT SuperCrew 4x4"],
      ["Honda", "civic", "EX Sedan"],
    ]);
  });

  it("reads an explicit item location state, otherwise leaves it empty", () => {
    const located = card("2018 Honda Accord EX-L", "$18,600.00", "50").replace(
      '<div class="s-card__caption">',
      '<div class="s-card__attribute-row"><span>Located in Houston, TX</span></div><div class="s-card__caption">',
    );
    const usOnly = card("2018 Honda Accord EX-L", "$18,600.00", "51").replace(
      '<div class="s-card__caption">',
      '<div class="s-card__attribute-row"><span>Located in United States</span></div><div class="s-card__caption">',
    );
    const rows = parseEbaySoldHtml(
      located + usOnly + card("2018 Honda Accord EX-L", "$18,600.00", "52"),
    );
    expect(rows.map((r) => r.location_state)).toEqual([
      "TX",
      undefined,
      undefined,
    ]);
  });
});

describe("splitSoldMakeModelTrim", () => {
  const split = (s: string) => splitSoldMakeModelTrim(s.split(/\s+/));
  it.each([
    ["Ford F-150 XLT", { make: "Ford", model: "f150", trim: "XLT" }],
    [
      "Ford F150 Lariat 4x4",
      { make: "Ford", model: "f150", trim: "Lariat 4x4" },
    ],
    ["Ford F 150 XL", { make: "Ford", model: "f150", trim: "XL" }],
    ["Honda Civic EX", { make: "Honda", model: "civic", trim: "EX" }],
    ["Honda CR-V EX-L AWD", { make: "Honda", model: "crv", trim: "EX-L AWD" }],
    [
      "Jeep Grand Cherokee Laredo",
      { make: "Jeep", model: "grandcherokee", trim: "Laredo" },
    ],
    [
      "Tesla Model 3 Long Range",
      { make: "Tesla", model: "model3", trim: "Long Range" },
    ],
    [
      "Chevrolet Silverado 1500 LT",
      { make: "Chevrolet", model: "silverado1500", trim: "LT" },
    ],
    ["Chevy Equinox LT", { make: "Chevrolet", model: "equinox", trim: "LT" }],
    ["Ram 1500 Big Horn", { make: "Ram", model: "1500", trim: "Big Horn" }],
    [
      "Land Rover Range Rover Sport HSE",
      { make: "Land Rover", model: "rangerover", trim: "Sport HSE" },
    ],
    [
      "Chrysler Town & Country Touring",
      { make: "Chrysler", model: "towncountry", trim: "Touring" },
    ],
    ["Toyota Camry", { make: "Toyota", model: "camry", trim: undefined }],
    [
      "Honda Accord EX Clean Title Low Miles",
      { make: "Honda", model: "accord", trim: "EX" },
    ],
    [
      "Ford Mustang GT Premium Convertible 5.0 V8",
      { make: "Ford", model: "mustang", trim: "GT Premium Convertible 5.0" },
    ],
  ])("%s", (input, expected) => {
    expect(split(input)).toEqual(expected);
  });
  it("returns nothing for an empty title", () => {
    expect(splitSoldMakeModelTrim([])).toEqual({});
  });
});

describe("parseSoldLocationState", () => {
  it.each([
    [["Located in Houston, TX"], "TX"],
    [["Located in Texas, United States"], "TX"],
    [["Located in Austin, Texas"], "TX"],
    [["Item location: Denver, CO 80202, United States"], "CO"],
    [["Dallas, TX 75201"], "TX"],
    [["Located in United States"], undefined],
    [["Located in Toronto, Ontario, Canada"], undefined],
    [["Located in Houston"], undefined],
    [["98,000 miles", "Pre-Owned"], undefined],
    [["Located in Springfield, XX"], undefined],
    [[], undefined],
  ] as [string[], string | undefined][])("%j -> %s", (pieces, expected) => {
    expect(parseSoldLocationState(pieces)).toBe(expected);
  });
});
