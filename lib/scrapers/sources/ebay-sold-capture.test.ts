import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ebaySoldBarrier,
  isMissingColumnError,
  parseEbaySoldHtml,
  parseSoldLocationCity,
  soldConditionFrom,
  soldDelayMs,
  soldInsertRow,
  soldTitleStatusFrom,
  writeSoldRows,
} from "./ebay-sold";
import { soldCacheScope } from "./local-sold-cache";

const card = (opts: {
  title: string;
  price?: string;
  id: string;
  sub?: string;
  located?: string;
}) => `
<div class="s-card">
  <div class="s-card__title"><span>${opts.title}</span></div>
  <div class="s-card__subtitle">${opts.sub ?? ""}</div>
  <span class="s-card__price">${opts.price ?? "$18,600.00"}</span>
  <a class="s-card__link" href="https://www.ebay.com/itm/${opts.id}?hash=x"></a>
  ${opts.located ? `<div class="s-card__attribute-row"><span>${opts.located}</span></div>` : ""}
  <div class="s-card__caption">Sold  Apr 28, 2026</div>
</div>`;

describe("eBay sold capture detail", () => {
  it("stores price, date, title, ymm+trim, mileage, title status, city/state, condition, url and item id", () => {
    const [r] = parseEbaySoldHtml(
      card({
        title: "2018 Ford F-150 XLT SuperCrew Salvage Title",
        id: "315000000001",
        sub: "Pre-Owned · 98,000 miles",
        located: "Located in Houston, TX",
      }),
    );
    expect(r).toMatchObject({
      year: 2018,
      make: "Ford",
      model: "f150",
      sold_price: 18600,
      mileage: 98000,
      title_status: "salvage",
      condition: "used",
      location_state: "TX",
      location_city: "Houston",
      item_id: "315000000001",
      source_url: "https://www.ebay.com/itm/315000000001",
    });
    expect(r.sold_at?.slice(0, 10)).toBe("2026-04-28");
    expect(soldInsertRow(r)).toMatchObject({
      basis: "sold",
      sale_channel: "ebay",
      source: "ebay_motors",
      source_item_id: "315000000001",
      location_city: "Houston",
      condition: "used",
      title_status: "salvage",
    });
  });

  it("leaves city, condition and title status empty when the card doesn't state them", () => {
    const [r] = parseEbaySoldHtml(
      card({
        title: "2017 Honda Civic EX",
        id: "2",
        located: "Located in United States",
      }),
    );
    expect(r.location_city).toBeUndefined();
    expect(r.location_state).toBeUndefined();
    expect(r.condition).toBeUndefined();
    expect(r.title_status).toBeUndefined();
  });

  it("parses only an explicit 'Located in City, ST' line for the city", () => {
    expect(parseSoldLocationCity(["Located in Dallas, TX 75201"])).toBe(
      "Dallas",
    );
    expect(parseSoldLocationCity(["Located in Texas, United States"])).toBe(
      undefined,
    );
    expect(parseSoldLocationCity(["Dallas, TX"])).toBe(undefined);
    expect(parseSoldLocationCity(["Located in Toronto, ON"])).toBe(undefined);
  });

  it.each([
    ["Clean Title, one owner", "clean"],
    ["CLEAN REBUILT TITLE", "rebuilt"],
    ["Salvage title runs and drives", "salvage"],
    ["flood car", "flood"],
    ["lemon law buyback", "lemon"],
    ["low miles", undefined],
  ])("title status from %s", (text, want) => {
    expect(soldTitleStatusFrom(text)).toBe(want);
  });

  it.each([
    ["Pre-Owned", "used"],
    ["Certified Pre-Owned", "certified"],
    ["For parts or not working", "for_parts"],
    ["Brand New", "new"],
    ["", undefined],
  ])("condition from %s", (text, want) => {
    expect(soldConditionFrom(text)).toBe(want);
  });
});

describe("ebaySoldBarrier: challenges are recorded, not bypassed", () => {
  it("flags ban statuses, eBay's edge error page and challenge pages", () => {
    expect(ebaySoldBarrier(403, "")).toBe("HTTP 403");
    expect(ebaySoldBarrier(429, "")).toBe("HTTP 429");
    expect(
      ebaySoldBarrier(
        200,
        "<html><head><title>Error Page | eBay</title></head></html>",
      ),
    ).toBe("eBay error page");
    expect(
      ebaySoldBarrier(200, "<title>Pardon Our Interruption...</title>"),
    ).toBe("bot challenge page");
    expect(ebaySoldBarrier(200, card({ title: "2018 Honda Accord", id: "1" }))).toBeNull();
  });
});

describe("writeSoldRows", () => {
  const rows = parseEbaySoldHtml(
    card({ title: "2018 Honda Accord EX-L", id: "77", located: "Located in Houston, TX" }),
  );

  function fakeSb(responses: Array<{ data?: unknown[]; error?: unknown }>) {
    const payloads: Record<string, unknown>[][] = [];
    const sb = {
      from: () => ({
        upsert: (payload: Record<string, unknown>[]) => {
          payloads.push(payload);
          return { select: async () => responses.shift() ?? { data: [] } };
        },
      }),
    };
    return { sb: sb as never, payloads };
  }

  it("writes basis + sale_channel + detail columns", async () => {
    const { sb, payloads } = fakeSb([{ data: [{ source_item_id: "77" }] }]);
    await expect(writeSoldRows(sb, rows)).resolves.toBe(1);
    expect(payloads[0][0]).toMatchObject({ basis: "sold", sale_channel: "ebay" });
  });

  it("retries without the detail columns before the migration is applied", async () => {
    const { sb, payloads } = fakeSb([
      {
        error: {
          code: "PGRST204",
          message:
            "Could not find the 'location_city' column of 'sold_listings' in the schema cache",
        },
      },
      { data: [{ source_item_id: "77" }] },
    ]);
    await expect(writeSoldRows(sb, rows)).resolves.toBe(1);
    expect(payloads[1][0]).not.toHaveProperty("sale_channel");
    expect(payloads[1][0]).not.toHaveProperty("location_city");
    expect(payloads[1][0]).toMatchObject({ basis: "sold", location_state: "TX" });
  });

  it("throws any other write error so the run is not recorded as a 0-row success", async () => {
    const { sb } = fakeSb([{ error: { code: "42501", message: "permission denied" } }]);
    await expect(writeSoldRows(sb, rows)).rejects.toThrow(/write failed/);
  });

  it("recognises missing-column errors only", () => {
    expect(isMissingColumnError({ code: "42703", message: "x" })).toBe(true);
    expect(isMissingColumnError({ code: "23505", message: "dup" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
  });
});

describe("pacing and cache scope", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("waits 5-7.5s between sold searches by default, never under 1.5s", () => {
    expect(soldDelayMs(() => 0)).toBe(5000);
    expect(soldDelayMs(() => 1)).toBe(7500);
    vi.stubEnv("EBAY_SOLD_DELAY_MS", "10");
    expect(soldDelayMs(() => 0)).toBe(1500);
  });
  it("keeps the sold-id cache per Supabase project", () => {
    expect(soldCacheScope("https://qupzqpezslsbobhugswp.supabase.co")).toBe(
      "qupzqpezslsbobhugswp",
    );
    expect(soldCacheScope("http://127.0.0.1:54321")).toBe("127-0-0-1");
    expect(soldCacheScope(undefined)).toBe("default");
  });
});
