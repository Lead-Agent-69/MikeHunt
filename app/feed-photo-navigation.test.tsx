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
const pointer = async (
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
  id = 1,
  primary = true,
) => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: primary },
  });
  await act(async () => target.dispatchEvent(event));
  return event;
};
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  unavailable.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
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

it("swipes Feed photos once without turning the generated click into a second move", async () => {
  await render();
  const photo = host.querySelector("img")!;
  await pointer(photo, "pointerdown", 250, 100);
  await pointer(photo, "pointermove", 100, 102);
  await pointer(photo, "pointerup", 100, 102);
  expect(photo.src).toContain("rear.jpg");
  await act(async () =>
    photo.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 }),
    ),
  );
  expect(photo.src).toContain("rear.jpg");
  await pointer(photo, "pointerdown", 100, 100);
  await pointer(photo, "pointerup", 250, 100);
  expect(photo.src).toContain("front.jpg");
});

it("keeps vertical gestures free and ignores canceled or multi-pointer gestures", async () => {
  await render();
  const photo = host.querySelector("img")!;
  expect(photo.style.touchAction).toBe("pan-y pinch-zoom");
  await pointer(photo, "pointerdown", 250, 100);
  const move = await pointer(photo, "pointermove", 240, 200);
  expect(move.defaultPrevented).toBe(false);
  await pointer(photo, "pointerup", 100, 100);
  expect(photo.src).toContain("front.jpg");
  await pointer(photo, "pointerdown", 250, 100);
  await pointer(photo, "pointercancel", 100, 100);
  await pointer(photo, "pointerup", 100, 100);
  expect(photo.src).toContain("front.jpg");
  await pointer(photo, "pointerdown", 250, 100);
  await pointer(photo, "pointerdown", 100, 100, 2, false);
  await pointer(photo, "pointerup", 100, 100);
  expect(photo.src).toContain("front.jpg");
});

it("keeps overlay buttons and fullscreen swipes from becoming a second card gesture", async () => {
  await render();
  const next = host.querySelector<HTMLButtonElement>(
    '[aria-label="Next photo of Ford Escape"]',
  )!;
  await pointer(next, "pointerdown", 250, 100);
  await pointer(next, "pointerup", 100, 100);
  await click("Next photo of Ford Escape");
  expect(host.querySelector("img")?.src).toContain("rear.jpg");
  await click("Enlarge photos of Ford Escape");
  const fullscreen = document.querySelector<HTMLElement>(
    '[role="dialog"] [data-photo-navigation]',
  )!;
  await pointer(fullscreen, "pointerdown", 250, 100);
  await pointer(fullscreen, "pointerup", 100, 100);
  expect(
    document.querySelector('[role="dialog"] img')?.getAttribute("src"),
  ).toContain("rear.jpg");
  await act(async () =>
    document
      .querySelector<HTMLButtonElement>('[aria-label="Close photo preview"]')!
      .click(),
  );
  expect(host.querySelector("img")?.src).toContain("rear.jpg");
});
