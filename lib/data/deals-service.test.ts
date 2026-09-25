import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Supabase client so we can drive a paginated .range() result set. The builder is chainable:
// from → select → eq → not → order → range (terminal, returns the page).
const mockRange = vi.fn();
const chain = {
  select: vi.fn(() => chain),
  eq: vi.fn(() => chain),
  not: vi.fn(() => chain),
  order: vi.fn(() => chain),
  range: mockRange,
};
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from: vi.fn(() => chain) }),
}));

import { DealsService } from "./deals-service";

describe("DealsService.getAvailableMakes (distinct, paginated past the 1000-row cap)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pages with .range() until a short page, deduping across pages", async () => {
    const page1 = Array.from({ length: 1000 }, (_, i) => ({
      make: `Make${i % 50}`, // 50 distinct, repeated
    }));
    const page2 = [{ make: "Bentley" }, { make: "Camaro" }]; // only on page 2 — would be lost under the cap
    mockRange
      .mockResolvedValueOnce({ data: page1, error: null })
      .mockResolvedValueOnce({ data: page2, error: null });

    const makes = await new DealsService().getAvailableMakes();

    expect(mockRange).toHaveBeenNthCalledWith(1, 0, 999);
    expect(mockRange).toHaveBeenNthCalledWith(2, 1000, 1999);
    expect(makes).toContain("Bentley"); // reached only by paging past 1000
    expect(makes).toContain("Camaro");
    expect(makes.filter((m) => m === "Make0")).toHaveLength(1); // deduped
    expect(makes).toEqual([...makes].sort()); // sorted
  });

  it("drops extraction junk (bare symbols, pure numbers) but keeps real makes", async () => {
    mockRange.mockResolvedValueOnce({
      data: [
        { make: "Toyota" },
        { make: "!" },
        { make: "1953" },
        { make: "F" },
        { make: "BMW" },
      ],
      error: null,
    });
    const makes = await new DealsService().getAvailableMakes();
    expect(makes).toEqual(["BMW", "Toyota"]);
  });

  it("stops at the first short page (no infinite loop)", async () => {
    mockRange.mockResolvedValueOnce({ data: [{ make: "Honda" }], error: null });
    const makes = await new DealsService().getAvailableMakes();
    expect(mockRange).toHaveBeenCalledTimes(1);
    expect(makes).toEqual(["Honda"]);
  });
});
