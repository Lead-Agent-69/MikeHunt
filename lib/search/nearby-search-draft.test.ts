import { describe, expect, it } from "vitest";
import { nearbySearchDraft } from "./nearby-search-draft";

describe("nearby search scope", () => {
  it("removes a state boundary once the user enters a complete ZIP", () => {
    expect(nearbySearchDraft("63101")).toEqual({
      zip: "63101",
      clearStateBoundary: true,
    });
  });
  it("keeps partial input from changing the selected market and preserves leading zeroes", () => {
    expect(nearbySearchDraft("6310").clearStateBoundary).toBe(false);
    expect(nearbySearchDraft("02108").zip).toBe("02108");
    expect(nearbySearchDraft("63a10")).toEqual({
      zip: "6310",
      clearStateBoundary: false,
    });
  });
});
