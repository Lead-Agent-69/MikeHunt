import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchForYou, fetchSimilarPrompt } from "./client";
import { isMissingDealSignalsTable } from "./signals";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isMissingDealSignalsTable", () => {
  it("detects PostgREST / Postgres missing-relation codes", () => {
    expect(isMissingDealSignalsTable({ code: "PGRST205" })).toBe(true);
    expect(isMissingDealSignalsTable({ code: "42P01" })).toBe(true);
    expect(
      isMissingDealSignalsTable({
        message: 'relation "deal_signals" does not exist',
      }),
    ).toBe(true);
    expect(isMissingDealSignalsTable({ code: "42501" })).toBe(false);
    expect(isMissingDealSignalsTable(null)).toBe(false);
  });
});

describe("reco client readers", () => {
  it("fetchSimilarPrompt returns JSON on ok and null on failure", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ prompt: null, signalsAvailable: false }),
    });
    vi.stubGlobal("fetch", fetchMock);
    // jsdom / node: window may be undefined in vitest node env — stub it
    (globalThis as any).window = globalThis;
    await expect(fetchSimilarPrompt()).resolves.toEqual({
      prompt: null,
      signalsAvailable: false,
    });
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    await expect(fetchSimilarPrompt()).resolves.toBeNull();
  });

  it("fetchForYou passes limit and returns null on network error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [],
        personalized: false,
        signalsAvailable: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    (globalThis as any).window = globalThis;
    const body = await fetchForYou(12);
    expect(body?.signalsAvailable).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toContain("limit=12");
    fetchMock.mockRejectedValue(new Error("offline"));
    await expect(fetchForYou()).resolves.toBeNull();
  });
});
