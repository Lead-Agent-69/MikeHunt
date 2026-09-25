import { describe, it, expect } from "vitest";
import { stableId, hashJitter } from "./stable-id";

describe("stableId", () => {
  it("is deterministic for the same basis", () => {
    expect(stableId("123 Main St|65801")).toBe(stableId("123 Main St|65801"));
  });
  it("differs for different basis", () => {
    expect(stableId("a")).not.toBe(stableId("b"));
  });
  it("namespaces with a prefix", () => {
    expect(stableId("x", "redfin").startsWith("redfin-")).toBe(true);
  });
});

describe("hashJitter", () => {
  it("is deterministic and within [-amp, amp]", () => {
    const a = hashJitter("seed", 1, 0.4);
    expect(a).toBe(hashJitter("seed", 1, 0.4));
    expect(Math.abs(a)).toBeLessThanOrEqual(0.4);
  });
  it("different salts give different offsets (lat vs lng)", () => {
    expect(hashJitter("seed", 1)).not.toBe(hashJitter("seed", 2));
  });
});
