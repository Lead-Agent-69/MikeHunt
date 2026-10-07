import { describe, expect, it } from "vitest";
import { parseGuestPrefsCookie } from "./merge-guest-prefs";

describe("parseGuestPrefsCookie", () => {
  it("round-trips base64url JSON", () => {
    const raw = Buffer.from(
      JSON.stringify({ homeLocation: { state: "IA" } }),
      "utf8",
    ).toString("base64url");
    expect(parseGuestPrefsCookie(raw)).toEqual({
      homeLocation: { state: "IA" },
    });
    expect(parseGuestPrefsCookie(undefined)).toEqual({});
    expect(parseGuestPrefsCookie("!!!")).toEqual({});
  });
});
