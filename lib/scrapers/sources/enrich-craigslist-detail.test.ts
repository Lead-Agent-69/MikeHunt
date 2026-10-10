import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchPublicHtml = vi.hoisted(() => vi.fn());

vi.mock("@/lib/net/fetch-public-html", () => ({
  fetchPublicHtml,
}));

import { UrlNotAllowedError } from "@/lib/net/public-url";
import { enrichCraigslistDetail } from "./index";

describe("enrichCraigslistDetail", () => {
  beforeEach(() => {
    fetchPublicHtml.mockReset();
  });

  it("routes through fetchPublicHtml and does not soft-succeed on blocked URLs", async () => {
    fetchPublicHtml.mockRejectedValueOnce(new UrlNotAllowedError());
    await expect(
      enrichCraigslistDetail("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(fetchPublicHtml).toHaveBeenCalledWith(
      "http://169.254.169.254/latest/meta-data",
    );
  });

  it("returns empty when the public fetch misses", async () => {
    fetchPublicHtml.mockResolvedValueOnce(null);
    await expect(
      enrichCraigslistDetail("https://dallas.craigslist.org/cto/d/x/123.html"),
    ).resolves.toEqual({});
  });

  it("parses VIN / mileage / images from fetched HTML", async () => {
    fetchPublicHtml.mockResolvedValueOnce({
      html: `
        <html>
          <div class="attr auto_vin"><span class="valu">1HGCM82633A004352</span></div>
          <div class="attr auto_miles"><span class="valu">90,000</span></div>
          <div class="attr auto_title_status"><span class="valu">clean</span></div>
          <div class="gallery"><img src="https://images.craigslist.org/00A_abc_600x450.jpg" /></div>
        </html>
      `,
      finalUrl: "https://dallas.craigslist.org/cto/d/x/123.html",
    });
    await expect(
      enrichCraigslistDetail("https://dallas.craigslist.org/cto/d/x/123.html"),
    ).resolves.toMatchObject({
      vin: "1HGCM82633A004352",
      mileage: 90000,
      condition: "clean_title",
      images: ["https://images.craigslist.org/00A_abc_600x450.jpg"],
    });
  });
});

import { craigslistGalleryImages } from "./index";

describe("craigslistGalleryImages", () => {
  it("keeps full-size photos once per image id and drops the thumbnail strip", () => {
    expect(
      craigslistGalleryImages([
        "https://images.craigslist.org/01010_4eft6Hinzq1_0CI0t2_600x450.jpg",
        "https://images.craigslist.org/01010_4eft6Hinzq1_0CI0t2_50x50c.jpg",
        "https://images.craigslist.org/00a0a_hWRNhXErGNm_0CI0t2_50x50c.jpg",
        "https://images.craigslist.org/00a0a_hWRNhXErGNm_0CI0t2_600x450.jpg",
        "https://images.craigslist.org/01010_4eft6Hinzq1_0CI0t2_600x450.jpg",
        "https://evil.example/x_600x450.jpg",
        undefined,
      ]),
    ).toEqual([
      "https://images.craigslist.org/01010_4eft6Hinzq1_0CI0t2_600x450.jpg",
      "https://images.craigslist.org/00a0a_hWRNhXErGNm_0CI0t2_600x450.jpg",
    ]);
  });
});
