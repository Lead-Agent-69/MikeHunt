import { describe, expect, it, vi } from "vitest";
const fetchImage = vi.hoisted(() => vi.fn());
vi.mock("@/lib/net/fetch-public-image", () => ({
  fetchPublicImage: fetchImage,
}));
import { inspectListingPhotos, probeListingPhoto } from "./photo-health";
const a = "https://images.craigslist.org/a.jpg",
  b = "https://images.craigslist.org/b.jpg";
describe("gallery verification", () => {
  it("promotes a working photo without keeping a known broken cover first", async () => {
    const probe = vi
      .fn()
      .mockResolvedValueOnce({ state: "missing", status: 404 })
      .mockResolvedValueOnce({ state: "available", status: 200 });
    const result = await inspectListingPhotos([a, b], { probe });
    expect(result.state).toBe("available");
    expect(result.images).toEqual([b]);
  });
  it("quarantines only when every supplied image definitively fails", async () => {
    expect(
      (
        await inspectListingPhotos([a, b], {
          probe: async () => ({ state: "missing", status: 410 }),
        })
      ).state,
    ).toBe("unavailable");
    expect(
      (
        await inspectListingPhotos([a, b], {
          maxPhotos: 1,
          probe: async () => ({ state: "missing", status: 404 }),
        })
      ).state,
    ).toBe("unknown");
    expect(
      (
        await inspectListingPhotos([a], {
          probe: async () => ({ state: "unknown", status: 429 }),
        })
      ).state,
    ).toBe("unknown");
  });
  it("respects cancellation before probing or publishing a result", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      inspectListingPhotos([a], { signal: controller.signal }),
    ).rejects.toThrow();
  });
  it("retains placeholder provenance without counting it as available or deleting the listing artifact", async () => {
    const result = await inspectListingPhotos([a], {
      probe: async () => ({ state: "placeholder" }),
    });
    expect(result.state).toBe("placeholder");
    expect(result.verifiedUrl).toBeNull();
    expect(result.placeholderUrls).toEqual([a]);
    expect(result.images).toEqual([a]);
    const mixed = await inspectListingPhotos([a, b], {
      probe: async (url) => ({
        state: url === a ? "placeholder" : "available",
      }),
    });
    expect(mixed.state).toBe("available");
    expect(mixed.verifiedUrl).toBe(b);
    expect(mixed.images).toEqual([b, a]);
    expect(mixed.placeholderUrls).toEqual([a]);
    expect(
      (
        await inspectListingPhotos([a, b], {
          maxPhotos: 1,
          probe: async () => ({ state: "placeholder" }),
        })
      ).state,
    ).toBe("unknown");
  });
  it("refuses unknown hosts and does not mistake HTTP success HTML for a photo", async () => {
    fetchImage.mockClear();
    expect((await probeListingPhoto("https://unknown.test/a.jpg")).state).toBe(
      "unknown",
    );
    expect(fetchImage).not.toHaveBeenCalled();
    fetchImage.mockResolvedValueOnce({
      ok: true,
      body: Buffer.from("<html>no photo</html>"),
    });
    expect((await probeListingPhoto(a)).state).toBe("unknown");
    fetchImage.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await probeListingPhoto(a)).state).toBe("unknown");
  });
  it("identifies a known placeholder URL without fetching extra bytes", async () => {
    fetchImage.mockClear();
    expect(await probeListingPhoto("https://dealer.test/no-photo.jpg")).toEqual(
      { state: "placeholder" },
    );
    expect(fetchImage).not.toHaveBeenCalled();
  });
  it("does not quarantine a gallery when its host returns a temporary non-image response", async () => {
    for (const status of [403, 415, 429, 500, 502, 503]) {
      fetchImage.mockResolvedValueOnce({ ok: false, status });
      expect((await inspectListingPhotos([a])).state).toBe("unknown");
    }
    fetchImage.mockResolvedValueOnce({
      ok: true,
      body: Buffer.from("<html>challenge</html>"),
    });
    expect((await inspectListingPhotos([a])).state).toBe("unknown");
    for (const status of [404, 410]) {
      fetchImage.mockResolvedValueOnce({ ok: false, status });
      expect((await inspectListingPhotos([a])).state).toBe("unavailable");
    }
  });
});
