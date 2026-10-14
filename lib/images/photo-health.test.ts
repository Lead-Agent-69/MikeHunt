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
    expect((await probeListingPhoto(a)).state).toBe("missing");
    fetchImage.mockResolvedValueOnce({ ok: false, status: 403 });
    expect((await probeListingPhoto(a)).state).toBe("unknown");
  });
});
