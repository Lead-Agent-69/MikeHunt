import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const beta = readFileSync("app/(marketing)/beta/page.tsx", "utf8");
const success = readFileSync("app/(marketing)/beta/success/page.tsx", "utf8");

describe("/beta is honest early access", () => {
  it("has no fake scarcity, social proof or testimonials", () => {
    for (const source of [beta, success]) {
      expect(source).not.toMatch(/TOTAL_BETA_SPOTS|spotsTaken|timeLeft/);
      expect(source).not.toMatch(/Spots Remaining|Offer Ends|first 500/i);
      expect(source).not.toMatch(
        /\+342|joined this week|Beta Users Are Saying/,
      );
      expect(source).not.toMatch(/Deal IQ|Max Bid|profitable deals|1,000\+/);
      expect(source).not.toContain("setInterval");
    }
  });

  it("uses the agreed early-access copy", () => {
    expect(beta).toContain("Early access");
    expect(beta).toContain(
      "Find cars worth checking — real asking prices and sources",
    );
    expect(beta).toContain(
      "Connect inventory and valuation tools you already trust.",
    );
    expect(beta).toContain("Saved searches & alerts");
    expect(beta).toContain("Listings with ask, source and when seen");
    expect(beta).toContain("Deal check without invented profit");
    expect(beta).toContain("What we ask of testers");
    expect(beta).toContain("Where the data comes from");
  });

  it("quotes no price, since checkout and /upgrade disagree", () => {
    for (const source of [beta, success]) {
      expect(source).not.toMatch(/\$\d/);
    }
  });

  it("sends people to signup, then onboarding or Discover, never /scan", () => {
    expect(beta).toContain('href="/register"');
    expect(beta).not.toContain("/api/checkout");
    expect(success).toContain('const BETA_NEXT_PATH = "/discover"');
    for (const source of [beta, success]) {
      expect(source).not.toContain('"/scan"');
    }
  });
});
