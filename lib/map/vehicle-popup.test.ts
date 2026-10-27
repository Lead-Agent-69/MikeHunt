import { describe, expect, it } from "vitest";
import { vehiclePopup, watchVehiclePopupPhoto } from "./vehicle-popup";

describe("vehicle map preview", () => {
  it("replaces a failed remote image with a friendly explanation and releases listeners", () => {
    const root = document.createElement("div");
    root.innerHTML = vehiclePopup({
      name: "Ford",
      image: "https://photos.example/car.jpg",
    });
    const image = root.querySelector("img")!;
    const fallback = root.querySelector<HTMLElement>(
      "[data-vehicle-popup-photo-fallback]",
    )!;
    const cleanup = watchVehiclePopupPhoto(root);
    expect(fallback.hidden).toBe(true);
    image.dispatchEvent(new Event("error"));
    expect(image.hidden).toBe(true);
    expect(fallback.hidden).toBe(false);
    expect(fallback.textContent).toContain("Photo could not load");
    cleanup();
    image.hidden = false;
    fallback.hidden = true;
    image.dispatchEvent(new Event("error"));
    expect(fallback.hidden).toBe(true);
    expect(root.innerHTML).not.toContain("onerror=");
  });
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
  it.each(["-$1,500", "$0", "Unavailable"])(
    "preserves an explicit net-profit value: %s",
    (valueText) => {
      const html = vehiclePopup({
        name: "Vehicle",
        priceLabel: "Estimated net profit",
        valueText,
      });
      expect(html).toContain("Estimated net profit");
      expect(html).toContain(valueText);
    },
  );
});
