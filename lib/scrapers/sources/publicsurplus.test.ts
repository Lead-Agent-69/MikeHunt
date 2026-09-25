import { describe, it, expect } from "vitest";
import { parsePublicSurplusHtml } from "./publicsurplus";

// Mirrors the real PublicSurplus card markup (img block with state badge + h6 title anchor + price).
const card = (auc: string, title: string, price: string, state = "VA") => `
<div class="auction-item-img">
  <a href="/sms/auction/view?auc=${auc}"><img class="lazy-img-loading" /></a>
  <span class="auction-item-state"> ${state} </span>
</div>
<div class="auction-item-body px-0">
  <h6 class="card-title ps-card-feat__body--title">
    <a href="/sms/auction/view?auc=${auc}" title="#${auc} - ${title}">#${auc} - ${title}</a>
  </h6>
  <div class="ps-card__body--children">Price: <b id="val_${auc}catGrid"> ${price} </b></div>
</div>`;

describe("parsePublicSurplusHtml", () => {
  it("parses a fleet car auction (title, year, price, state)", () => {
    const items = parsePublicSurplusHtml(
      card("4021503", "2012 Ford Fusion Sedan 4D - Car #35", "$3,250.00", "FL"),
    );
    expect(items).toHaveLength(1);
    const d = items[0];
    expect(d.source).toBe("gov_auction");
    expect(d.source_deal_id).toBe("4021503");
    expect(d.year).toBe(2012);
    expect(d.make).toBe("Ford");
    expect(d.ask_price).toBe(3250);
    expect(d.location_state).toBe("FL");
    expect(d.source_url).toBe(
      "https://www.publicsurplus.com/sms/auction/view?auc=4021503",
    );
  });

  it("skips listings with no model year and no bid value", () => {
    const html =
      card("1", "Enclosed Trailer", "$500.00") + // no year
      card("2", "Lot of misc office chairs", "$10.00") + // no year
      card("3", "2015 Chevy Malibu LS - Car #40", "$0.00") + // no bid
      card("4", "2017 Ford Taurus", "$4,100.00");
    const items = parsePublicSurplusHtml(html);
    expect(items).toHaveLength(1);
    expect(items[0].source_deal_id).toBe("4");
    expect(items[0].year).toBe(2017);
  });

  it("de-dupes repeated auction ids and never throws on junk", () => {
    const dup =
      card("9", "2010 Dodge Challenger", "$8,000.00") +
      card("9", "2010 Dodge Challenger", "$8,000.00");
    expect(parsePublicSurplusHtml(dup)).toHaveLength(1);
    expect(parsePublicSurplusHtml("<html>nope</html>")).toEqual([]);
    expect(parsePublicSurplusHtml("")).toEqual([]);
  });
});
