import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isAllowedImageUrl } from "./image-hosts";

describe("listing image host allowlist", () => {
  it("covers every image base declared by a scraper source", () => {
    const dir = "lib/scrapers/sources";
    const bases = readdirSync(dir)
      .filter((f) => f.endsWith(".ts") && !f.includes(".test."))
      .flatMap((f) =>
        Array.from(
          readFileSync(`${dir}/${f}`, "utf8").matchAll(
            /\b(?:IMG|IMAGE|PHOTO)_?BASE\w*\s*=\s*["'`](https?:\/\/[^"'`]+)["'`]/g,
          ),
        ).map((m) => m[1]),
      );
    expect(bases.length).toBeGreaterThan(0);
    for (const base of bases) {
      expect(isAllowedImageUrl(`${base}/x.jpg`), base).toBe(true);
    }
  });

  it.each([
    "https://images.craigslist.org/00a0a_abc_600x450.jpg",
    "https://scontent.xx.fbcdn.net/v/t1/abc.jpg",
    "https://i.ebayimg.com/images/g/abc/s-l1600.jpg",
    "https://webassets.lqdt1.com/assets/photos/1/2.jpg",
    "https://gsa-prod-ppms-attachments-prod.s3.amazonaws.com/a.jpg",
  ])("allows %s", (u) => expect(isAllowedImageUrl(u)).toBe(true));

  it.each([
    "https://evil.example/x.jpg",
    "https://craigslist.org.evil.example/x.jpg",
    "https://notcraigslist.org/x.jpg",
    "https://other-bucket.s3.amazonaws.com/x.jpg",
    "http://169.254.169.254/latest/meta-data/",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "not a url",
  ])("refuses %s", (u) => expect(isAllowedImageUrl(u)).toBe(false));
});
