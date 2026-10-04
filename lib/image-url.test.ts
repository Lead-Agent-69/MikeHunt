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

  it("proxies Craigslist and Facebook hotlink hosts", () => {
    const cl = "https://images.craigslist.org/00x00/photo.jpg";
    const fb = "https://scontent.xx.fbcdn.net/v/t1/photo.jpg";
    expect(needsImageProxy(cl)).toBe(true);
    expect(proxiedImage(cl)).toBe(
      `/api/image/proxy?url=${encodeURIComponent(cl)}`,
    );
    expect(proxiedImage(fb)).toContain("/api/image/proxy?url=");
    // Hotlink hosts still proxy every gallery frame (direct would fail).
    expect(galleryImageSrc(cl, 3)).toContain("/api/image/proxy?url=");
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
});
