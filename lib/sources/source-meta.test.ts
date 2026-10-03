import { describe, expect, it } from "vitest";
import {
  dealerSourceIdForHost,
  dealerSourceIdFromUrl,
  displaySource,
  sourceMeta,
} from "./source-meta";

describe("source display metadata", () => {
  it("uses listing URLs to show the real government source", () => {
    const source = displaySource(
      "gov_auction",
      "https://www.govdeals.com/asset/1234/25370",
    );

    expect(source).toBe("govdeals");
    expect(sourceMeta(source).label).toBe("GovDeals");
  });

  it("normalizes named small dealer source ids", () => {
    expect(sourceMeta("ae-of-miami").label).toBe("AE of Miami");
    expect(sourceMeta("stjames-auto").label).toBe("St. James Auto");
  });

  it("resolves small dealer source ids from hosts and listing URLs", () => {
    expect(dealerSourceIdForHost("https://www.aeofmiami.com/inventory")).toBe(
      "ae-of-miami",
    );
    expect(dealerSourceIdForHost("stjamesautoparts.com")).toBe("stjames-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "dg-auto",
      ]),
    ).toBe("dg-auto");
    expect(
      dealerSourceIdFromUrl("https://www.dgautollc.com/inventory/123", [
        "ae-of-miami",
      ]),
    ).toBeNull();
  });
});
