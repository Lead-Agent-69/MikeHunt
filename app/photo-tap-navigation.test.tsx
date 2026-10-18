import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoPreview } from "@/components/shared/PhotoPreview";
import { PhotoPreviewButton } from "@/components/shared/PhotoPreviewButton";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  sessionStorage.clear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const photos = ["Front", "Rear", "Interior"].map((alt, index) => ({
  src: `/photo-${index}.jpg`,
  alt,
}));
function open(count = 3) {
  function Harness() {
    const [selected, onSelect] = useState<number | null>(0);
    return (
      <PhotoPreview
        images={photos.slice(0, count)}
        selectedIndex={selected}
        onSelect={onSelect}
      />
    );
  }
  act(() => root.render(<Harness />));
  const area = document.querySelector<HTMLElement>("[data-photo-navigation]")!;
  vi.spyOn(area, "getBoundingClientRect").mockReturnValue(
    new DOMRect(100, 0, 400, 300),
  );
  return area;
}
function pointer(
  area: HTMLElement,
  type: string,
  x: number,
  y: number,
  primary = true,
  id = 1,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(event, {
    pointerId: { value: id },
    isPrimary: { value: primary },
  });
  act(() => area.dispatchEvent(event));
}
function tap(area: HTMLElement, x: number, y = 100) {
  pointer(area, "pointerdown", x, y);
  pointer(area, "pointerup", x, y);
  click(area, x, y);
}
function click(area: HTMLElement, x: number, y = 100) {
  act(() =>
    area.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        detail: 1,
        clientX: x,
        clientY: y,
      }),
    ),
  );
}
const visiblePhoto = () =>
  document.querySelector('[role="dialog"] img')?.getAttribute("alt");

describe("photo browsing gestures", () => {
  it("moves once on right/left taps, wraps both ends, and retains working arrows", () => {
    const area = open();
    tap(area, 450);
    expect(visiblePhoto()).toBe("Rear");
    tap(area, 150);
    expect(visiblePhoto()).toBe("Front");
    tap(area, 150);
    expect(visiblePhoto()).toBe("Interior");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Next image"]')!
        .click(),
    );
    expect(visiblePhoto()).toBe("Front");
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Previous image"]')!
        .click(),
    );
    expect(visiblePhoto()).toBe("Interior");
  });

  it("does not count a horizontal swipe and its generated click twice", () => {
    const area = open();
    pointer(area, "pointerdown", 450, 100);
    pointer(area, "pointermove", 250, 102);
    pointer(area, "pointerup", 250, 102);
    expect(visiblePhoto()).toBe("Rear");
    click(area, 250, 102);
    expect(visiblePhoto()).toBe("Rear");
    tap(area, 450);
    expect(visiblePhoto()).toBe("Interior");
  });

  it("ignores scrolling, canceled gestures, and multi-touch", () => {
    const area = open();
    pointer(area, "pointerdown", 450, 100);
    pointer(area, "pointermove", 440, 200);
    pointer(area, "pointerup", 450, 100);
    click(area, 450);
    expect(visiblePhoto()).toBe("Front");
    pointer(area, "pointerdown", 450, 100);
    pointer(area, "pointercancel", 450, 100);
    click(area, 450);
    expect(visiblePhoto()).toBe("Front");
    pointer(area, "pointerdown", 450, 100);
    pointer(area, "pointerdown", 150, 100, false, 2);
    pointer(area, "pointerup", 450, 100);
    click(area, 450);
    expect(visiblePhoto()).toBe("Front");
  });

  it("ignores a long press and retains single-photo previews without dead navigation", () => {
    const area = open(1);
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    pointer(area, "pointerdown", 450, 100);
    now.mockReturnValue(1700);
    pointer(area, "pointerup", 450, 100);
    click(area, 450);
    expect(visiblePhoto()).toBe("Front");
    expect(document.querySelector('[aria-label="Next image"]')).toBeNull();
    expect(document.querySelector('[aria-label="Previous image"]')).toBeNull();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("shows a retry after a failed photo and keeps navigation available", () => {
    open();
    act(() =>
      document
        .querySelector('[role="dialog"] img')!
        .dispatchEvent(new Event("error")),
    );
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "could not load",
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[role="status"] button')!
        .click(),
    );
    expect(visiblePhoto()).toBe("Front");
    act(() =>
      document
        .querySelector('[role="dialog"] img')!
        .dispatchEvent(new Event("error")),
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Next image"]')!
        .click(),
    );
    expect(visiblePhoto()).toBe("Rear");
  });

  it("keeps modal actions from opening the containing listing and restores focus", async () => {
    const navigate = vi.fn();
    act(() =>
      root.render(
        <div onClick={navigate}>
          <PhotoPreviewButton
            images={[
              "https://photos.test/one.jpg",
              "https://photos.test/two.jpg",
            ]}
            title="Honda Civic"
          />
        </div>,
      ),
    );
    const trigger = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Enlarge photos of Honda Civic"]',
    )!;
    act(() => trigger.click());
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Next image"]')!
        .click(),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "2 / 2",
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Close photo preview"]')!
        .click(),
    );
    expect(navigate).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger));
  });
  it("lets the viewer reach every captured photo beyond a card's 20-photo limit", () => {
    const images = Array.from(
      { length: 25 },
      (_, index) => `https://photos.test/${index}.jpg`,
    );
    act(() =>
      root.render(<PhotoPreviewButton images={images} title="Full gallery" />),
    );
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "1 / 25",
    );
    act(() =>
      document
        .querySelector<HTMLButtonElement>('[aria-label="Previous image"]')!
        .click(),
    );
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute("src"),
    ).toContain("24.jpg");
  });
});
