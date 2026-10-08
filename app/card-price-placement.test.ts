import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("at-a-glance card prices", () => {
  it("puts Scan price before completeness and collapsible evidence", () => {
    const source = readFileSync("components/shared/DealCard.tsx", "utf8");
    const price = source.indexOf('data-testid="dealcard-price"');
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(source.indexOf("<details"));
    expect(source).toContain(
      'askPrice > 0 ? `$${askPrice.toLocaleString()}` : "Not reported"',
    );
  });

  it("puts Discover price before match reasons and cost evidence", () => {
    const source = readFileSync(
      "components/discovery/DiscoveryCard.tsx",
      "utf8",
    );
    const price = source.indexOf('data-testid="discovery-card-price"');
    expect(price).toBeGreaterThan(0);
    expect(price).toBeLessThan(source.indexOf("Why shown"));
    expect(price).toBeLessThan(source.indexOf("<details"));
    expect(source).not.toContain("tracking-tight");
  });
});
