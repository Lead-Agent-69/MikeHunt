import { describe, expect, it } from "vitest";
import { isAllowedImageUrl } from "@/app/api/image/proxy/route";
import { CURATED_SITES } from "./curated-sites";

describe("platform dealer photo hosts", () => {
  it("every platform-tagged curated dealer's host (and www.) is an exact allowed image host", () => {
    const platform = CURATED_SITES.filter((s) => s.platform);
    expect(platform.length).toBeGreaterThan(10);
    for (const s of platform) {
      const bare = new URL(s.url).hostname.replace(/^www\./, "");
      expect(isAllowedImageUrl(`https://${bare}/photos/1.jpg`), bare).toBe(
        true,
      );
      expect(isAllowedImageUrl(`https://www.${bare}/photos/1.jpg`), bare).toBe(
        true,
      );
      // exact host, not a suffix match
      expect(isAllowedImageUrl(`https://evil.${bare}/x.jpg`), bare).toBe(false);
    }
  });

  it("every registry photoHosts entry (platform photo CDN) is an exact allowed image host", () => {
    const withHosts = CURATED_SITES.filter((s) => s.photoHosts?.length);
    expect(withHosts.length).toBeGreaterThanOrEqual(10);
    for (const s of withHosts)
      for (const host of s.photoHosts!) {
        expect(
          isAllowedImageUrl(`https://${host}/photos/1.jpg`),
          `${s.name}: ${host}`,
        ).toBe(true);
        expect(isAllowedImageUrl(`https://evil.${host}/x.jpg`), host).toBe(
          false,
        );
      }
  });
});
