import { describe, it, expect } from "vitest";
import { looksLikePlaceholderPrice } from "./placeholder-price";

describe("looksLikePlaceholderPrice — keep bait prices out of comps", () => {
  it("flags the classic placeholders", () => {
    expect(looksLikePlaceholderPrice(1)).toBe(true);
    expect(looksLikePlaceholderPrice(123)).toBe(true);
    expect(looksLikePlaceholderPrice(1234)).toBe(true);
    expect(looksLikePlaceholderPrice(12345)).toBe(true);
    expect(looksLikePlaceholderPrice(123456)).toBe(true);
    expect(looksLikePlaceholderPrice(1111)).toBe(true);
    expect(looksLikePlaceholderPrice(11111)).toBe(true);
    expect(looksLikePlaceholderPrice(4321)).toBe(true);
  });

  it("does NOT flag real prices — including common round asks", () => {
    expect(looksLikePlaceholderPrice(9999)).toBe(false); // real $9,999 ask
    expect(looksLikePlaceholderPrice(19999)).toBe(false);
    expect(looksLikePlaceholderPrice(24500)).toBe(false);
    expect(looksLikePlaceholderPrice(8700)).toBe(false); // the dropped-digit case → market detector handles
    expect(looksLikePlaceholderPrice(48700)).toBe(false);
    expect(looksLikePlaceholderPrice(2680)).toBe(false); // real cheap Copart Camry
    expect(looksLikePlaceholderPrice(12500)).toBe(false);
    expect(looksLikePlaceholderPrice(null)).toBe(false);
  });
});
