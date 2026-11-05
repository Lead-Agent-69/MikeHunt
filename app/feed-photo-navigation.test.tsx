import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save",
    toggle: vi.fn(),
  }),
}));
import { FeedVehicleCard } from "@/components/feed/FeedVehicleCard";

let root: Root, host: HTMLDivElement;
const unavailable = vi.fn();
const item = {
  id: "photo-feed",
  title: "Ford Escape",
  source: "cars_com",
  images: [
    "https://photos.example/front.jpg",
    "https://photos.example/rear.jpg",
    "https://photos.example/inside.jpg",
  ],
};
const render = async () => {
  await act(async () =>
    root.render(
      <FeedVehicleCard item={item} onPhotoUnavailable={unavailable} />,
    ),
  );
};
const click = async (label: string) => {
  const button = Array.from(host.querySelectorAll("button")).find(
    (button) =>
      button.getAttribute("aria-label") === label ||
      button.textContent === label,
  )!;
  await act(async () => button.click());
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  unavailable.mockClear();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  sessionStorage.clear();
  vi.unstubAllGlobals();
});
it("announces gallery position, wraps through photos and restores selection on return", async () => {
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Photo 1 of 3",
  );
  await click("Previous photo of Ford Escape");
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Photo 3 of 3",
  );
  await act(async () => root.render(null));
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Photo 3 of 3",
  );
  await click("Next photo of Ford Escape");
  expect(host.querySelector('[role="status"]')?.textContent).toBe(
    "Photo 1 of 3",
  );
});
it("skips failed images and retries them locally without changing other cards", async () => {
  await render();
  const stage = host.querySelector('[data-testid="feed-vehicle-photo"]');
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")?.src).toContain("rear.jpg");
  await click("Previous photo of Ford Escape");
  expect(host.querySelector("img")?.src).toContain("inside.jpg");
  await click("Retry failed photos");
  expect(host.querySelector("img")?.src).toContain("front.jpg");
  expect(host.querySelector('[data-testid="feed-vehicle-photo"]')).toBe(stage);
  expect(unavailable).not.toHaveBeenCalled();
});
it("retains the existing exhausted-photo handling", async () => {
  await render();
  for (let index = 0; index < 3; index++) {
    await act(async () =>
      host.querySelector("img")!.dispatchEvent(new Event("error")),
    );
  }
  expect(host.querySelector("article")).toBeNull();
  expect(unavailable).toHaveBeenCalledWith(item.id);
});
