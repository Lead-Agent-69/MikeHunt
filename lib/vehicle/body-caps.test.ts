// Ren #301 nit (d): vin-history (VinAudit) and observed-price-history reads are capped.
import { afterEach, describe, expect, it, vi } from "vitest";

const huge = () =>
  new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new Uint8Array(64 * 1024));
      },
    }),
    { status: 200 },
  );

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("capped body reads outside the NHTSA/EPA clients", () => {
  it("fetchObservedPrices refuses a body past 2 MB", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => huge()),
    );
    const { fetchObservedPrices } = await import("./observed-price-history");
    await expect(fetchObservedPrices("/api/x")).rejects.toThrow();
  });

  it("fetchObservedPrices still parses a normal body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify([
              { price: 1000, observedAt: "2026-10-01T00:00:00Z" },
            ]),
          ),
      ),
    );
    const { fetchObservedPrices } = await import("./observed-price-history");
    expect(await fetchObservedPrices("/api/x")).toHaveLength(1);
  });

  it("fetchNmvtis returns null (not a hang or OOM) on a body past 1 MB, with a timeout signal", async () => {
    vi.stubEnv("VINAUDIT_KEY", "k");
    const f = vi.fn(async (_u: string, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return huge();
    });
    vi.stubGlobal("fetch", f);
    const { fetchNmvtis } = await import("./vin-history");
    expect(await fetchNmvtis("1FT7W2BT8GED11804")).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
