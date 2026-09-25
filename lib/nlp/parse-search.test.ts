import { describe, it, expect } from "vitest";
import { parseSearchQuery } from "./parse-search";
import { generateApiKey, hashApiKey } from "../api-keys";

describe("parseSearchQuery", () => {
  it("parses a full natural-language query", () => {
    const p = parseSearchQuery(
      "clean F-150s under 25k in Texas with good profit",
    );
    expect(p.make).toBe("Ford");
    expect(p.model).toBe("F-150");
    expect(p.max_price).toBe(25000);
    expect(p.state).toBe("TX");
    expect(p.require_go).toBe(true);
  });

  it("parses make/model and a $ price + year range", () => {
    const p = parseSearchQuery("Honda Accord 2015-2019 under $12,000");
    expect(p.make).toBe("Honda");
    expect(p.model).toBe("Accord");
    expect(p.min_year).toBe(2015);
    expect(p.max_year).toBe(2019);
    expect(p.max_price).toBe(12000);
  });

  it("captures a profit target", () => {
    const p = parseSearchQuery("Silverados with 3000 profit");
    expect(p.make).toBe("Chevrolet");
    expect(p.target_profit).toBe(3000);
  });

  it("returns an empty-ish object for gibberish", () => {
    const p = parseSearchQuery("hello world");
    expect(p.make).toBeUndefined();
  });
});

describe("api-keys", () => {
  it("mints a prefixed key and hashes deterministically", () => {
    const { raw, hash, prefix } = generateApiKey();
    expect(raw.startsWith("dhp_")).toBe(true);
    expect(prefix).toBe(raw.slice(0, 12));
    expect(hash).toBe(hashApiKey(raw));
    expect(hash).toHaveLength(64); // sha256 hex
  });
  it("different keys hash differently", () => {
    expect(generateApiKey().hash).not.toBe(generateApiKey().hash);
  });
});
