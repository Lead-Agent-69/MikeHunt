import { describe, it, expect } from "vitest";
import {
  detectAntiBot,
  detectPlatform,
  recommendedTier,
} from "./platform-detector";

describe("detectAntiBot — wall fingerprinting → verified free tool", () => {
  it("Cloudflare interstitial → stealth tier", () => {
    const v = detectAntiBot(
      "<!DOCTYPE html><title>Just a moment...</title><div>Enable JavaScript and cookies to continue cf-chl</div>",
      403,
    );
    expect(v.vendor).toBe("cloudflare");
    expect(v.freeBypass).toBe("stealth");
  });

  it("Cloudflare by cf-ray header alone → stealth (high confidence)", () => {
    const v = detectAntiBot("<html>ok</html>", 200, { "cf-ray": "8abc" });
    expect(v.vendor).toBe("cloudflare");
    expect(v.confidence).toBe("high");
  });

  it("PerimeterX 'Access denied' → headed tier", () => {
    const v = detectAntiBot(
      "<html><body>Access to this page has been denied. px-captcha</body></html>",
      403,
    );
    expect(v.vendor).toBe("perimeterx");
    expect(v.freeBypass).toBe("headed");
  });

  it("Akamai reference page → headed tier", () => {
    const v = detectAntiBot(
      "<html>Access Denied Reference #18.abcd1234.0000 You don't have permission</html>",
      403,
    );
    expect(v.vendor).toBe("akamai");
    expect(v.freeBypass).toBe("headed");
  });

  it("DataDome → NO free bypass (route around)", () => {
    const v = detectAntiBot(
      "<html>captcha geo.captcha-delivery.com datadome</html>",
      403,
    );
    expect(v.vendor).toBe("datadome");
    expect(v.freeBypass).toBeNull();
  });

  it("Imperva/Incapsula incident → headed tier", () => {
    const v = detectAntiBot(
      "<html>Request unsuccessful. Incapsula incident ID: 123-456 visid_incap</html>",
      403,
    );
    expect(v.vendor).toBe("imperva");
    expect(v.freeBypass).toBe("headed");
  });

  it("a normal page → 'none' / static", () => {
    const v = detectAntiBot(
      "<html><head><title>2016 Ford Explorer for sale</title></head><body>" +
        "x".repeat(2000) +
        "</body></html>",
      200,
    );
    expect(v.vendor).toBe("none");
    expect(v.freeBypass).toBe("static");
  });

  it("hard block status with empty body → unknown wall, no auto-bypass", () => {
    const v = detectAntiBot("", 429);
    expect(v.vendor).toBe("unknown");
    expect(v.freeBypass).toBeNull();
  });
});

describe("detectPlatform — framework → extraction strategy", () => {
  it("Next.js → next-data island", () => {
    expect(detectPlatform('<script id="__NEXT_DATA__">{}</script>')).toEqual({
      framework: "nextjs",
      dataStrategy: "next-data",
    });
  });

  it("ASP.NET (Municibid) → html", () => {
    const p = detectPlatform(
      '<form><input name="__VIEWSTATE" value="x"/></form> page.aspx',
    );
    expect(p.framework).toBe("aspnet");
    expect(p.dataStrategy).toBe("html");
  });

  it("React SPA (GSA Auctions CRA shell) → spa-api", () => {
    const p = detectPlatform(
      '<div id="root"></div><script src="/static/js/main.c9cb1658.chunk.js"></script>',
    );
    expect(p.framework).toBe("react-spa");
    expect(p.dataStrategy).toBe("spa-api");
  });

  it("JSON-LD server-rendered → ld-json", () => {
    expect(
      detectPlatform('<script type="application/ld+json">{}</script>')
        .dataStrategy,
    ).toBe("ld-json");
  });

  it("plain HTML → html", () => {
    expect(detectPlatform("<html><body>cars</body></html>").dataStrategy).toBe(
      "html",
    );
  });
});

describe("recommendedTier — one-call brain for the ladder", () => {
  it("returns the verified tool for a detected wall", () => {
    expect(recommendedTier("just a moment cf-chl", 403).tier).toBe("stealth");
    expect(recommendedTier("px-captcha", 403).tier).toBe("headed");
    expect(recommendedTier("geo.captcha-delivery.com", 403).tier).toBeNull();
  });
});
