import { describe, it, expect } from "vitest";
import { FEDERAL_OUTLETS, STATE_GOV_OUTLETS, govOutletsForState, statesWithGovOutlets } from "./gov-surplus-outlets";

describe("gov surplus outlets", () => {
  it("covers the six gap states", () => {
    expect(statesWithGovOutlets()).toEqual(expect.arrayContaining(["AK", "ID", "KS", "ND", "OK", "TN"]));
  });

  it("only ingests through an official API; terms-banned marketplaces are link-only", () => {
    for (const o of [...STATE_GOV_OUTLETS, ...FEDERAL_OUTLETS]) {
      expect(o.url).toMatch(/^https:\/\//);
      if (/govdeals|publicsurplus|purplewave|hibid|proxibid|allsurplus/i.test(o.url)) expect(o.access).toBe("link");
      if (o.access === "api") expect(o.platform).toBe("GSA Auctions");
    }
  });

  it("always includes GSA", () => {
    expect(govOutletsForState("ks").map((o) => o.platform)).toContain("GSA Auctions");
    expect(govOutletsForState("ZZ")).toEqual(FEDERAL_OUTLETS);
  });
});
