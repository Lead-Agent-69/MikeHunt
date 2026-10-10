import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchObservedPrices,
  OBSERVED_PRICES_TIMEOUT_MS,
  normalizeObservedPrices,
} from "./observed-price-history";

afterEach(() => vi.unstubAllGlobals());
describe("observed listing prices", () => {
  it("fetch carries a 10s timeout signal", async () => {
    const spy = vi.spyOn(AbortSignal, "timeout");
    const f = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal("fetch", f);
    await expect(fetchObservedPrices("/history")).rejects.toThrow();
    expect(spy).toHaveBeenCalledWith(OBSERVED_PRICES_TIMEOUT_MS);
    expect(OBSERVED_PRICES_TIMEOUT_MS).toBe(10_000);
    expect(f.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
    spy.mockRestore();
  });

  it("sorts dated observations and rejects missing or invalid prices and dates", () => {
    const points = normalizeObservedPrices([
      { price: "12000", observed_at: "2026-02-02" },
      { price: 15000, observedAt: "2026-01-01" },
      { price: 0, observedAt: "2026-03-01" },
      { price: 100, observedAt: "invalid" },
      { price: null, observedAt: "2026-03-02" },
    ]);
    expect(points.map((p) => p.price)).toEqual([15000, 12000]);
  });
  it("deduplicates timestamps rather than inventing additional price drops", () => {
    expect(
      normalizeObservedPrices({
        history: [
          { price: 10, observedAt: "2026-01-01" },
          { price: 9, observedAt: "2026-01-01" },
        ],
      }),
    ).toHaveLength(1);
  });
  it("rejects failed requests instead of reporting empty history", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchObservedPrices("/history")).rejects.toThrow(
      "unavailable",
    );
  });
  it("rejects error envelopes even with a successful HTTP status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ error: "internal" }),
      }),
    );
    await expect(fetchObservedPrices("/history")).rejects.toThrow(
      "unavailable",
    );
  });
});
