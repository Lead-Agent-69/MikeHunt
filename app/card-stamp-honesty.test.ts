import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("buyer card stamps", () => {
  it("does not default a profit score or urge a buy", () => {
    const deal = readFileSync("components/shared/DealCard.tsx", "utf8");
    const discovery = readFileSync("components/discovery/DiscoveryCard.tsx", "utf8");
    const swipe = readFileSync("app/(dashboard)/swipe/page.tsx", "utf8");

    expect(deal).not.toContain("profitScore = 50");
    expect(deal).not.toContain("Profit Score:");
    expect(deal).not.toContain("IQ {iq.score}");
    expect(deal).toContain("Ask-based estimate");
    expect(deal).toContain("Resale basis not on file.");
    expect(discovery).not.toContain("Worth a look");
    expect(discovery).not.toContain("Act now");
    expect(discovery).toContain("Ask-based estimate");
    expect(discovery).toContain("Comp-backed resale");
    expect(swipe).not.toContain('label: "BUY"');
    expect(swipe).not.toContain("Est. net profit");
    expect(swipe).not.toContain("sortBy=profitScore");
  });
});
