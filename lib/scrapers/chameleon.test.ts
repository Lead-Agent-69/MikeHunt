import { describe, it, expect } from "vitest";
import { assess, chameleonHarvest } from "./chameleon";

describe("assess — the verdict + next move", () => {
  it("wins when vehicles were extracted", () => {
    const v = assess({
      blocked: false,
      unverified: false,
      wall: "cloudflare",
      dataStrategy: "ld-json",
      count: 64,
      tier: "stealth",
    });
    expect(v.ok).toBe(true);
    expect(v.diagnosis).toContain("64 vehicles");
    expect(v.diagnosis).toContain("beat cloudflare");
    expect(v.recommendation).toBeUndefined();
  });

  it("DataDome → route via aggregator", () => {
    const v = assess({
      blocked: true,
      unverified: false,
      wall: "datadome",
      dataStrategy: "html",
      count: 0,
      tier: "headed",
    });
    expect(v.ok).toBe(false);
    expect(v.recommendation).toMatch(/aggregator/i);
  });

  it("empty SPA shell → capture the XHR API", () => {
    const v = assess({
      blocked: false,
      unverified: true,
      wall: "none",
      dataStrategy: "spa-api",
      count: 0,
      tier: "static",
    });
    expect(v.ok).toBe(false);
    expect(v.recommendation).toMatch(/XHR|endpoint|capture/i);
  });

  it("server HTML with no island → bespoke parser", () => {
    const v = assess({
      blocked: false,
      unverified: true,
      wall: "none",
      dataStrategy: "html",
      count: 0,
      tier: "static",
    });
    expect(v.ok).toBe(false);
    expect(v.recommendation).toMatch(/bespoke parser|selectors/i);
  });
});

describe("chameleonHarvest — full orchestration (injected fetcher)", () => {
  const jsonLdPage = `<html><script type="application/ld+json">${JSON.stringify(
    {
      "@type": "Vehicle",
      name: "2018 Toyota Tacoma",
      brand: "Toyota",
      offers: { price: 28000 },
    },
  )}</script></html>`;

  it("fetches, extracts, and reports OK on a JSON-LD site", async () => {
    const report = await chameleonHarvest("https://dealer.example/inventory", {
      source: "example",
      fetchImpl: async () => ({
        html: jsonLdPage,
        tier: "static",
        blocked: false,
      }),
    });
    expect(report.ok).toBe(true);
    expect(report.count).toBe(1);
    expect(report.deals[0].make).toBe("Toyota");
    expect(report.dataStrategy).toBe("ld-json");
    expect(report.diagnosis).toContain("1 vehicle");
  });

  it("reports a blocked DataDome wall with a routing recommendation", async () => {
    const report = await chameleonHarvest("https://walled.example/cars", {
      fetchImpl: async () => ({
        html: "captcha geo.captcha-delivery.com datadome",
        tier: "headed",
        blocked: true,
      }),
    });
    expect(report.ok).toBe(false);
    expect(report.wall).toBe("datadome");
    expect(report.recommendation).toMatch(/aggregator/i);
  });

  it("prefers a bespoke extractor, self-heals to generic when it returns nothing", async () => {
    const report = await chameleonHarvest("https://dealer.example/x", {
      extractor: () => [], // bespoke parser whiffs (markup drift)
      fetchImpl: async () => ({
        html: jsonLdPage,
        tier: "static",
        blocked: false,
      }),
    });
    expect(report.ok).toBe(true); // generic extractor backstopped it
    expect(report.count).toBe(1);
    expect(report.extraction).toBe("structured");
  });

  it("falls to the AI rung when bespoke + structured both find nothing", async () => {
    const report = await chameleonHarvest("https://oddsite.example/cars", {
      aiFallback: true,
      // a reached page with no JSON island the structured extractor can read
      fetchImpl: async () => ({
        html:
          "<html><body>" +
          "lots of unstructured text ".repeat(50) +
          "</body></html>",
        tier: "static",
        blocked: false,
      }),
      aiExtractImpl: async () => [
        {
          source: "x",
          year: 2014,
          make: "GMC",
          model: "Sierra",
          ask_price: 18000,
        },
      ],
    });
    expect(report.extraction).toBe("ai");
    expect(report.ok).toBe(true);
    expect(report.diagnosis).toMatch(/AI rescue/i);
  });

  it("does NOT invoke the AI rung when aiFallback is off", async () => {
    let called = false;
    const report = await chameleonHarvest("https://oddsite.example/cars", {
      fetchImpl: async () => ({
        html: "<html><body>" + "x ".repeat(200) + "</body></html>",
        tier: "static",
        blocked: false,
      }),
      aiExtractImpl: async () => {
        called = true;
        return [{ source: "x", year: 2014, make: "GMC", ask_price: 1 }];
      },
    });
    expect(called).toBe(false);
    expect(report.extraction).toBe("none");
    expect(report.ok).toBe(false);
  });
});
