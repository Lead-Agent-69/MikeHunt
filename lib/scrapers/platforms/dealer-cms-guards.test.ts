import { load } from "cheerio";
import { describe, expect, it } from "vitest";
import {
  crawlDealerCms,
  isSameSiteHref,
  stripContactInfo,
  type DealerCmsSite,
} from "./dealer-cms";
import { guardedFetch } from "../polite/polite-fetch";

const site: DealerCmsSite = {
  sourceId: "vehiclesnetwork-example-com",
  name: "Example Motors",
  baseUrl: "https://www.example-motors.com",
  inventoryUrl: "https://www.example-motors.com/autos",
  state: "TX",
  defaultCondition: "run_drive",
  detailPattern: /\/autos\/(?:\d{4}-[^/?#]+-)?(\d+)(?:[/?#]|$)/i,
  singlePage: true,
};

const card = (href: string, title: string, price: string) =>
  `<div class="vehicle"><a href="${href}"><h3>${title}</h3></a><p>Price: ${price}</p><p>Mileage: 88,000</p></div>`;

describe("crawlDealerCms off-site guard", () => {
  it("drops cards whose href leaves the dealer's host (www. ignored)", async () => {
    const html = `<html><body>
      ${card("https://example-motors.com/autos/2018-Ford-F-150-Dallas-TX-101", "2018 Ford F-150", "$18,995")}
      ${card("/autos/2016-Honda-Civic-Dallas-TX-102", "2016 Honda Civic", "$9,995")}
      ${card("http://169.254.169.254/autos/2019-Evil-Car-Dallas-TX-103", "2019 Toyota Camry", "$12,995")}
      ${card("https://attacker.example/autos/2017-Jeep-Wrangler-Dallas-TX-104", "2017 Jeep Wrangler", "$15,995")}
    </body></html>`;
    const fetched: string[] = [];
    const deals = await crawlDealerCms(site, {
      fetchHtml: async (url) => {
        fetched.push(url);
        return { ok: true, status: 200, body: html };
      },
      load,
    });
    const urls = deals.map((d) => d.source_url);
    expect(urls).toHaveLength(2);
    expect(urls.every((u) => isSameSiteHref(u!, site.baseUrl))).toBe(true);
    expect(urls.some((u) => /169\.254|attacker/.test(u!))).toBe(false);
    expect(fetched).toEqual([site.inventoryUrl]);
  });

  it("isSameSiteHref ignores www. and rejects junk", () => {
    expect(isSameSiteHref("https://example-motors.com/x", "https://www.example-motors.com")).toBe(true);
    expect(isSameSiteHref("https://www.example-motors.com/x", "https://example-motors.com")).toBe(true);
    expect(isSameSiteHref("https://evil-example-motors.com/x", "https://www.example-motors.com")).toBe(false);
    expect(isSameSiteHref("https://example-motors.com.evil.io/x", "https://www.example-motors.com")).toBe(false);
    expect(isSameSiteHref("not a url", "https://www.example-motors.com")).toBe(false);
  });
});

describe("stripContactInfo", () => {
  it("removes phone numbers and emails but keeps vehicle copy, VIN and price", () => {
    const out = stripContactInfo(
      "Clean 4x4, VIN 1FTEW1EP5JFA12345, $18,995. Call (555) 123-4567 or 1-800-555-1234, email sales@dealer.com today!",
    )!;
    expect(out).not.toMatch(/555|800|@/);
    expect(out).toContain("1FTEW1EP5JFA12345");
    expect(out).toContain("$18,995");
    expect(out).toContain("Clean 4x4");
  });
  it("returns undefined for contact-only text", () => {
    expect(stripContactInfo("Call 555.123.4567")).toBeUndefined();
  });
});

describe("guardedFetch (politeFetch SSRF guard)", () => {
  const guard = async (u: string) => {
    if (/169\.254|localhost|127\.0\.0\.1/.test(new URL(u).hostname)) throw new Error("blocked");
  };
  it("checks every redirect hop and refuses a redirect into a private host", async () => {
    const seen: string[] = [];
    const raw = async (u: string, init?: RequestInit) => {
      seen.push(`${u} ${init?.redirect}`);
      return new Response("", { status: 302, headers: { location: "http://169.254.169.254/latest" } });
    };
    await expect(guardedFetch(raw, guard)("https://dealer.example/autos")).rejects.toThrow("blocked");
    expect(seen).toEqual(["https://dealer.example/autos manual"]);
  });
  it("follows public redirects manually", async () => {
    const raw = async (u: string) =>
      u.endsWith("/old")
        ? new Response("", { status: 301, headers: { location: "/new" } })
        : new Response("ok", { status: 200 });
    const res = await guardedFetch(raw, guard)("https://dealer.example/old");
    expect(await res.text()).toBe("ok");
  });
});
