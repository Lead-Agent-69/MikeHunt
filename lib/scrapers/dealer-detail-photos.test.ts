import { describe, expect, it } from "vitest";
import { dealerDetailPhotos } from "./dealer-detail-photos";

describe("dealer detail gallery", () => {
  it("captures SalvageZone slider photos but excludes clones, logos and related cars", () => {
    const html =
      '<img src="/logo.jpg"><div class="car-details"><div class="flexslider"><ul><li class="clone"><img src="/2.jpg"></li><li><img src="/1.jpg"></li><li><img src="/2.jpg"></li></ul></div></div><div class="featured-cars"><img src="/other-car.jpg"></div>';
    expect(dealerDetailPhotos(html, "https://dealer.example/cars/123")).toEqual(
      ["https://dealer.example/1.jpg", "https://dealer.example/2.jpg"],
    );
  });
  it("keeps only the matching structured listing's photos", () => {
    const html = `<script type="application/ld+json">${JSON.stringify([
      {
        "@type": "Car",
        name: "2020 Ford Escape",
        url: "/cars/123",
        image: ["/1.jpg", "/2.jpg"],
      },
      {
        "@type": "Car",
        name: "2021 Ford Escape",
        url: "/cars/456",
        image: ["/other.jpg"],
      },
    ])}</script>`;
    expect(dealerDetailPhotos(html, "https://dealer.example/cars/123")).toEqual(
      ["https://dealer.example/1.jpg", "https://dealer.example/2.jpg"],
    );
  });
  it("does not treat page-wide pictures or an unsafe URL as a gallery", () => {
    expect(
      dealerDetailPhotos(
        '<img src="/random.jpg"><div class="vehicle-gallery"><img src="javascript:alert(1)"></div>',
        "https://dealer.example/cars/123",
      ),
    ).toEqual([]);
  });
});
