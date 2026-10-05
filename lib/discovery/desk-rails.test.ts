import { describe, expect, it } from "vitest";
import {
  discoverDeskForMode,
  filterRailsForDesk,
  hiddenRailKeysForMode,
} from "./desk-rails";

const rails = [
  "foryou",
  "flash",
  "best",
  "distressed",
  "roi",
  "salvage",
  "repairable",
  "auctionLots",
  "trucks",
  "budget",
  "fresh",
].map((key) => ({ key, deals: [] }));

describe("discover desk rails", () => {
  it("maps saved modes to desks and fails closed", () => {
    expect(discoverDeskForMode("dealer")).toBe("flip");
    expect(discoverDeskForMode("reseller")).toBe("flip");
    expect(discoverDeskForMode("teardown")).toBe("parts");
    expect(discoverDeskForMode("parts")).toBe("parts");
    expect(discoverDeskForMode("diy")).toBe("personal");
    expect(discoverDeskForMode("personal")).toBe("personal");
    expect(discoverDeskForMode(undefined)).toBe("personal");
    expect(discoverDeskForMode({ evil: true })).toBe("personal");
  });

  it("never ships flip rails to personal / diy / signed-out desks", () => {
    const keys = filterRailsForDesk(rails, "personal").map((r) => r.key);
    for (const hidden of ["roi", "salvage", "auctionLots", "fresh"])
      expect(keys).not.toContain(hidden);
    expect(keys).toContain("best");
    expect(keys).toContain("repairable");
  });

  it("keeps salvage for parts but drops the other flip rails", () => {
    const keys = filterRailsForDesk(rails, "parts").map((r) => r.key);
    expect(keys).toContain("salvage");
    for (const hidden of ["roi", "auctionLots", "fresh"])
      expect(keys).not.toContain(hidden);
  });

  it("keeps every rail for flip desks", () => {
    expect(filterRailsForDesk(rails, "flip")).toHaveLength(rails.length);
    expect(hiddenRailKeysForMode("dealer").size).toBe(0);
  });
});
