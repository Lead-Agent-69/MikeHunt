import { describe, expect, it } from "vitest";
import { vehiclePopup } from "./vehicle-popup";

describe("vehicle map preview", () => {
  it("renders an actual photo, price meaning and vehicle link", () => {
    const html = vehiclePopup({
      name: "Ford F-150",
      image: "https://dealer.example/photo.jpg",
      price: 3000,
      priceLabel: "Possible down payment",
      url: "/deal/vehicle-1",
      approx: true,
    });
    expect(html).toContain("<img");
    expect(html).toContain("Possible down payment");
    expect(html).toContain("$3,000");
    expect(html).toContain("Approximate location");
    expect(html).toContain('href="/deal/vehicle-1"');
  });
  it("escapes source text and rejects active-content URLs", () => {
    const html = vehiclePopup({
      name: '<script>alert("bad")</script>',
      image: "javascript:alert(1)",
      url: "javascript:alert(1)",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Photo not available");
  });
  it("does not turn an absent price into a free vehicle", () => {
    expect(vehiclePopup({ name: "Vehicle", price: 0 })).toContain(
      "Not reported",
    );
  });
});
