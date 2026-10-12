import { describe, it, expect } from "vitest";
import { parseEbaySoldHtml, soldInventoryQuery } from "./ebay-sold";

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
  it("keeps full model names in inventory-driven sold searches", () => {
    expect(soldInventoryQuery("Tesla", "Model 3")).toBe("tesla model 3");
    expect(soldInventoryQuery("Land Rover", "Range Rover Sport")).toBe(
      "land rover range rover sport",
    );
    expect(soldInventoryQuery("", "Model 3")).toBeUndefined();
  });
  it("retains manual cars but still excludes accessory manuals", () => {
    const rows = parseEbaySoldHtml(
      card("2018 Honda Civic manual", "$18,000", "901") +
        card("2018 Honda Civic owners manual", "$1,500", "902"),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("2018 Honda Civic manual");
  });
  it("does not use completed-listing payment teasers as sold-price observations", () => {
    expect(
      parseEbaySoldHtml(
        card("2018 Honda Accord down payment: $2,600", "$2,600", "99"),
      ),
    ).toEqual([]);
  });
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
    expect(r.model).toBe("Accord");
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

  it.each([
    ["2018 Honda Accord EX-L", "Honda", "Accord"],
    ["2020 Tesla Model 3 Long Range", "Tesla", "Model 3"],
    [
      "2021 Land Rover Range Rover Sport HSE",
      "Land Rover",
      "Range Rover Sport",
    ],
    ["2021 Land Rover Discovery HSE", "Land Rover", "Discovery"],
    ["2020 Alfa Romeo Giulia Ti", "Alfa Romeo", "Giulia"],
    ["2019 Jeep Grand Cherokee Limited", "Jeep", "Grand Cherokee"],
    ["2018 Honda Accord similar to Toyota Camry", "Honda", "Accord"],
    ["2022 Ford F-150 similar to Ford Bronco Sport", "Ford", "F-150"],
    ["2022 Ford Bronco Sport Big Bend", "Ford", "Bronco Sport"],
    ["2020 Chevy Camaro SS", "Chevrolet", "Camaro"],
    ["2020 Mercedes Benz C300", "Mercedes-Benz", "C300"],
    ["2020 Range Rover Sport HSE", "Land Rover", "Range Rover Sport"],
    [
      "2020 Land Rover Range Rover Velar R-Dynamic",
      "Land Rover",
      "Range Rover Velar",
    ],
    [
      "2020 Land Rover Range Rover Evoque SE",
      "Land Rover",
      "Range Rover Evoque",
    ],
    ["2020 Land Rover Discovery Sport HSE", "Land Rover", "Discovery Sport"],
  ])("preserves comparable identity for %s", (title, make, model) => {
    const rows = parseEbaySoldHtml(card(title, "$22,000", "700"));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ make, model });
  });

  it("does not invent a make/model from an unidentified title", () => {
    expect(
      parseEbaySoldHtml(card("2020 Unknown vehicle", "$22,000", "701")),
    ).toEqual([]);
  });
});
