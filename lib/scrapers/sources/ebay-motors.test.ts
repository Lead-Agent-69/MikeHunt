import { describe, it, expect } from "vitest";
import { parseEbayHtml } from "./ebay-motors";

const card = (title: string, price: string, id: string, subtitle = "") => `
<div class="s-card">
  <div class="s-card__title"><span class="su-styled-text">${title}</span></div>
  <span class="s-card__price">${price}</span>
  <a class="s-card__link" href="https://www.ebay.com/itm/${id}?hash=abc"></a>
  <div class="s-card__subtitle">${subtitle}</div>
  <img src="https://i.ebayimg.com/x.jpg" />
</div>`;

describe("parseEbayHtml", () => {
  it("parses a vehicle card and strips the 'New Listing' badge glued to the title", () => {
    const items = parseEbayHtml(
      card(
        "New Listing2018 Ford F-150 XLT 4x4",
        "$28,500.00",
        "123456",
        "Pre-Owned · 60,000 mi",
      ),
    );
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("ebay_motors");
    expect(d.year).toBe(2018);
    expect(d.make).toBe("Ford");
    expect(d.ask_price).toBe(28500);
    expect(d.source_deal_id).toBe("123456");
    expect(d.source_url).toBe("https://www.ebay.com/itm/123456");
  });

  it("skips promo cards, parts (no year), and out-of-range prices", () => {
    const html =
      card("Shop on eBay", "$20.00", "1") +
      card("Ford F-150 Tail Light Assembly", "$45.00", "2") + // no year
      card("2019 Honda Accord EX", "$50.00", "3") + // too cheap = part/scam
      card("2019 Honda Accord EX-L", "$23,900.00", "4");
    const items = parseEbayHtml(html);
    expect(items).toHaveLength(1);
    expect(items[0].source_deal_id).toBe("4");
    expect(items[0].make).toBe("Honda");
  });
});
