import { describe, expect, it } from "vitest";
import { galleryImageSrc, needsImageProxy, proxiedImage } from "./image-url";

describe("image-url free-tier routing", () => {
  it("leaves dealer/gov CDN URLs direct (no proxy)", () => {
    const url = "https://webassets.lqdt1.com/assets/photo.jpg";
    expect(needsImageProxy(url)).toBe(false);
    expect(proxiedImage(url)).toBe(url);
    expect(galleryImageSrc(url, 0)).toBe(url);
    expect(galleryImageSrc(url, 2)).toBe(url);
  });

  it("never proxies Craigslist or Facebook photos: direct only", () => {
    const cl = "https://images.craigslist.org/00x00/photo.jpg";
    const fb = "https://scontent.xx.fbcdn.net/v/t1/photo.jpg";
    const fb2 = "https://scontent-iad3-1.xx.fbcdn.net/v/t1/photo.jpg";
    for (const u of [cl, fb, fb2]) {
      expect(needsImageProxy(u)).toBe(false);
      expect(proxiedImage(u)).toBe(u);
      expect(galleryImageSrc(u, 0)).toBe(u);
      expect(galleryImageSrc(u, 3)).toBe(u);
    }
  });

  it("passes through local, data, already-proxied, and our Storage URLs", () => {
    expect(proxiedImage("/images/car-placeholder.jpg")).toBe(
      "/images/car-placeholder.jpg",
    );
    expect(proxiedImage("data:image/png;base64,abc")).toBe(
      "data:image/png;base64,abc",
    );
    const proxied =
      "/api/image/proxy?url=" +
      encodeURIComponent("https://images.craigslist.org/x.jpg");
    expect(proxiedImage(proxied)).toBe(proxied);
    const hosted =
      "https://xyz.supabase.co/storage/v1/object/public/vehicle-photos/d/0.jpg";
    expect(proxiedImage(hosted)).toBe(hosted);
  });
  it("proxies SalvageZone photos that require the seller referrer", () => {
    const url =
      "https://www.salvagezone.com/images/vehicles/9251TOYOTA_012.jpg";
    expect(needsImageProxy(url)).toBe(true);
    expect(galleryImageSrc(url, 0)).toBe(
      `/api/image/proxy?url=${encodeURIComponent(url)}`,
    );
    expect(galleryImageSrc(url, 2)).toBe(proxiedImage(url));
    expect(
      needsImageProxy("https://salvagezone.com.evil.example/photo.jpg"),
    ).toBe(false);
  });
});
