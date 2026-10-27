import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/deal/RecentlySold", () => ({
  RecentlySold: () => <p>No verified sold records in this fixture.</p>,
}));
import { QuickVehicleReview } from "@/components/search/QuickVehicleReview";

let host: HTMLDivElement;
let root: Root;
const close = vi.fn();
beforeEach(() => {
  sessionStorage.removeItem("mh-photo-selection-v1");
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  close.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <QuickVehicleReview
        vehicle={{
          id: "review",
          title: "2020 Ford Escape",
          askPrice: 2600,
          priceLabel: "Possible down payment",
          images: [
            "https://photos.example/front.jpg",
            "https://photos.example/rear.jpg",
          ],
          mileage: 95000,
          locationCity: "St. Louis",
          locationState: "MO",
          source: "craigslist_dealer",
        }}
        onClose={close}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("keeps photos, amount meaning and vehicle facts together without inventing a valuation", () => {
  expect(document.body.querySelector("dialog")?.open).toBe(true);
  expect(document.body.querySelector("dialog")?.parentElement).toBe(
    document.body,
  );
  expect(document.body.textContent).toContain("95,000 mi");
  expect(document.body.textContent).toContain("St. Louis, MO");
  expect(document.body.textContent).toContain("Possible down payment");
  expect(document.body.textContent).not.toContain("Projected profit");
  expect(document.body.style.overflow).toBe("hidden");
});
it("browses the gallery and advances past a failed image", () => {
  const image = () => document.body.querySelector("img")!;
  expect(image().src).toContain("front.jpg");
  act(() =>
    document.body
      .querySelector<HTMLButtonElement>('[aria-label="Next review photo"]')!
      .click(),
  );
  expect(image().src).toContain("rear.jpg");
  act(() => image().dispatchEvent(new Event("error")));
  expect(image().src).toContain("front.jpg");
});
it("does not send photo controls or arrow keys into a surrounding swipe deck", () => {
  const pointer = vi.fn();
  const key = vi.fn();
  window.addEventListener("pointerdown", pointer);
  window.addEventListener("keydown", key);
  act(() =>
    document.body
      .querySelector("button")!
      .dispatchEvent(new Event("pointerdown", { bubbles: true })),
  );
  act(() =>
    document.body
      .querySelector("dialog")!
      .dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
  );
  expect(pointer).not.toHaveBeenCalled();
  expect(key).not.toHaveBeenCalled();
  expect(document.body.querySelector("img")!.src).toContain("rear.jpg");
  window.removeEventListener("pointerdown", pointer);
  window.removeEventListener("keydown", key);
});
it("dismisses on cancellation and backdrop clicks, but not a content click", () => {
  act(() => document.body.querySelector("h2")!.click());
  expect(close).not.toHaveBeenCalled();
  act(() => document.body.querySelector("dialog")!.click());
  expect(close).toHaveBeenCalledTimes(1);
  act(() =>
    document.body.querySelector("dialog")!.dispatchEvent(new Event("cancel")),
  );
  expect(close).toHaveBeenCalledTimes(2);
});
