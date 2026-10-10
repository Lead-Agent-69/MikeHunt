import { describe, expect, it } from "vitest";
import {
  accessDecision,
  normalizedHost,
  validGrant,
  type AccessGrant,
} from "./access-policy";
const now = Date.parse("2026-10-10T00:00:00Z");
const grant: AccessGrant = {
  sourceId: "dealer",
  host: "dealer.example",
  route: "feed",
  evidence: "https://dealer.example/permission",
  reviewedAt: "2026-10-01",
  expiresAt: "2027-01-01",
  collect: true,
  display: true,
  derive: false,
};
describe("reviewed source access", () => {
  it("fails closed without evidence, including unknown sources", () => {
    expect(
      accessDecision("copart", undefined, "collect", [], now).allowed,
    ).toBe(false);
    expect(
      accessDecision("unknown", undefined, "collect", [], now).allowed,
    ).toBe(false);
  });
  it("requires source, exact host, use, and a current review", () => {
    expect(
      accessDecision(
        "dealer",
        "https://www.dealer.example/car",
        "collect",
        [grant],
        now,
      ).allowed,
    ).toBe(true);
    for (const url of [
      "https://sibling.dealer.example/car",
      "https://dealer.example.evil/car",
      "http://user:pass@dealer.example/car",
      "file:///x",
    ]) {
      expect(
        accessDecision("dealer", url, "collect", [grant], now).allowed,
      ).toBe(false);
    }
    expect(
      accessDecision("other", undefined, "collect", [grant], now).allowed,
    ).toBe(false);
    expect(
      accessDecision("dealer", undefined, "derive", [grant], now).allowed,
    ).toBe(false);
    expect(
      accessDecision(
        "dealer",
        "https://dealer.example/car",
        "collect",
        [grant],
        now,
        "website",
      ).allowed,
    ).toBe(false);
    expect(
      accessDecision(
        "dealer",
        undefined,
        "collect",
        [{ ...grant, expiresAt: "2026-10-09" }],
        now,
      ).allowed,
    ).toBe(false);
    expect(
      accessDecision(
        "dealer",
        undefined,
        "collect",
        [{ ...grant, evidence: "operator says yes" }],
        now,
      ).allowed,
    ).toBe(false);
  });
  it("rejects invalid URLs", () => {
    expect(normalizedHost("bad")).toBeNull();
  });
  it("requires boolean rights, not truthy strings from malformed evidence", () => {
    expect(validGrant({ ...grant, display: "true" } as any, now)).toBe(false);
    expect(validGrant({ ...grant, collect: undefined } as any, now)).toBe(
      false,
    );
  });
});
