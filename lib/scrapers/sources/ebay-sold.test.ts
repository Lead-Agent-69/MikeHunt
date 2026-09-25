import { describe, it, expect } from "vitest";
import { parseEbaySoldHtml } from "./ebay-sold";

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
});
