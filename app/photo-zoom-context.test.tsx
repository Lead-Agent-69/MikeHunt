import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZoomablePhoto } from "@/components/shared/ZoomablePhoto";
import { PhotoPreviewButton } from "@/components/shared/PhotoPreviewButton";
import { ListingThumbnail } from "@/components/shared/ListingThumbnail";
import { usePhotoSelection } from "@/hooks/usePhotoSelection";

let root: Root, host: HTMLDivElement;
const photos = [
  "https://dealer.test/front.jpg",
  "https://dealer.test/rear.jpg",
];
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
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
function button(name: string) {
  return document.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`)!;
}
function press(key: string) {
  act(() =>
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key, cancelable: true }),
    ),
  );
}
function pointer(
  area: HTMLElement,
  type: string,
  x: number,
  y: number,
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
    isPrimary: { value: id === 1 },
  });
  act(() => area.dispatchEvent(event));
}
function click(area: HTMLElement) {
  act(() =>
    area.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        detail: 1,
        clientX: 350,
        cancelable: true,
      }),
    ),
  );
}
function mountZoom(src = photos[0], move = vi.fn(), onDismiss = vi.fn()) {
  act(() =>
    root.render(
      <ZoomablePhoto
        src={src}
        alt="Inspection photo"
        move={move}
        multiple
        onDismiss={onDismiss}
      />,
    ),
  );
  const area = host.querySelector<HTMLElement>("[data-photo-navigation]")!;
  const img = area.querySelector("img")!;
  Object.defineProperties(area, {
    clientWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 300 },
  });
  Object.defineProperties(img, {
    clientWidth: { configurable: true, value: 400 },
    clientHeight: { configurable: true, value: 300 },
  });
  act(() => img.dispatchEvent(new Event("load")));
  return { area, img, move, onDismiss };
}

describe("shared inspection zoom", () => {
  it("zooms, clamps panning and ignores photo taps or dismiss drags while magnified", () => {
    const { area, img, move, onDismiss } = mountZoom();
    act(() => button("Zoom in").click());
    expect(area.dataset.photoZoom).toBe("1.5");
    pointer(area, "pointerdown", 200, 100);
    pointer(area, "pointermove", 2000, 2000);
    pointer(area, "pointerup", 2000, 2000);
    click(area);
    expect(img.style.transform).toContain("translate(100px, 75px)");
    expect(move).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => button("Reset photo zoom").click());
    expect(area.dataset.photoZoom).toBe("1");
    expect(img.style.transform).toContain("translate(0px, 0px)");
  });
  it("uses keyboard arrows for panning while zoomed, caps zoom and resets on a new photo", () => {
    const { area, img, move } = mountZoom();
    press("+");
    press("ArrowRight");
    expect(img.style.transform).toContain("translate(-40px, 0px)");
    expect(move).not.toHaveBeenCalled();
    for (let i = 0; i < 10; i++) press("+");
    expect(area.dataset.photoZoom).toBe("4");
    expect(button("Zoom in").disabled).toBe(true);
    mountZoom(photos[1], move);
    expect(area.dataset.photoZoom).toBe("1");
    mountZoom(photos[0], move);
    expect(area.dataset.photoZoom).toBe("1");
    press("+");
    press("0");
    expect(area.dataset.photoZoom).toBe("1");
  });
  it("pinches to magnify and never turns lifting a finger into a photo change", () => {
    const { area, move, onDismiss } = mountZoom();
    pointer(area, "pointerdown", 100, 100);
    pointer(area, "pointerdown", 200, 100, 2);
    pointer(area, "pointermove", 300, 100, 2);
    expect(area.dataset.photoZoom).toBe("2");
    pointer(area, "pointerup", 300, 100, 2);
    pointer(area, "pointerup", 100, 100);
    click(area);
    expect(move).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it("dismisses a downward drag only at fit and ignores a canceled gesture", () => {
    const { area, onDismiss, move } = mountZoom();
    pointer(area, "pointerdown", 100, 50);
    pointer(area, "pointermove", 100, 220);
    pointer(area, "pointercancel", 100, 220);
    click(area);
    expect(onDismiss).not.toHaveBeenCalled();
    pointer(area, "pointerdown", 100, 50);
    pointer(area, "pointerup", 100, 220);
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(move).not.toHaveBeenCalled();
  });
  it("disables zoom for failed images and retries the same photo", () => {
    const { area, move } = mountZoom();
    act(() => area.querySelector("img")!.dispatchEvent(new Event("error")));
    expect(button("Zoom in").disabled).toBe(true);
    const retry = Array.from(area.querySelectorAll("button")).find(
      (item) => item.textContent === "Retry photo",
    )!;
    act(() => retry.click());
    expect(area.querySelector("img")?.src).toBe(photos[0]);
    expect(move).not.toHaveBeenCalled();
  });
});

function Selection({
  images = photos,
  id = "vehicle-a",
}: {
  images?: string[];
  id?: string;
}) {
  const selection = usePhotoSelection(images, id);
  return (
    <>
      <output>{selection.index}</output>
      <button onClick={() => selection.select(images.length - 1)}>Last</button>
    </>
  );
}
describe("remembering inspection context", () => {
  it("restores a selection after remount, isolates vehicles and resets changed galleries", () => {
    act(() => root.render(<Selection />));
    act(() => host.querySelector("button")!.click());
    expect(host.querySelector("output")?.textContent).toBe("1");
    act(() => root.render(null));
    act(() => root.render(<Selection />));
    expect(host.querySelector("output")?.textContent).toBe("1");
    act(() => root.render(<Selection id="vehicle-b" />));
    expect(host.querySelector("output")?.textContent).toBe("0");
    act(() => root.render(<Selection images={[...photos].reverse()} />));
    expect(host.querySelector("output")?.textContent).toBe("0");
  });
  it("expires old selections and tolerates malformed browser storage", () => {
    sessionStorage.setItem(
      "mh-photo-selection-v1",
      JSON.stringify([
        {
          scope: "vehicle-a",
          gallery: JSON.stringify(photos),
          src: photos[1],
          at: Date.now() - 25 * 3600000,
        },
      ]),
    );
    act(() => root.render(<Selection />));
    expect(host.querySelector("output")?.textContent).toBe("0");
    sessionStorage.setItem("mh-photo-selection-v1", "{broken");
    act(() => host.querySelector("button")!.click());
    expect(host.querySelector("output")?.textContent).toBe("1");
  });
  it("remembers the enlargement selection and never reopens after a gallery disappears", () => {
    const render = (images: string[]) =>
      act(() =>
        root.render(<PhotoPreviewButton images={images} title="Saved car" />),
      );
    render(photos);
    act(() => button("Enlarge photos of Saved car").click());
    act(() => button("Next image").click());
    act(() => button("Close photo preview").click());
    act(() => button("Enlarge photos of Saved car").click());
    expect(
      document.querySelector('[role="dialog"] img')?.getAttribute("src"),
    ).toBe(photos[1]);
    render([]);
    render(photos);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
  it("keeps the current selection usable when browser storage rejects writes", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    act(() => root.render(<Selection id="blocked-storage" />));
    act(() => host.querySelector("button")!.click());
    expect(host.querySelector("output")?.textContent).toBe("1");
  });
});

it("recovers a saved or comparison cover using only its supplied photos, then shows a placeholder", () => {
  act(() =>
    root.render(<ListingThumbnail images={photos} title="Same vehicle" />),
  );
  act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector("img")?.src).toBe(photos[1]);
  act(() => host.querySelector("img")!.dispatchEvent(new Event("error")));
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toContain("Photo unavailable");
  act(() =>
    root.render(
      <ListingThumbnail
        images={["https://dealer.test/new.jpg"]}
        title="Updated vehicle"
      />,
    ),
  );
  expect(host.querySelector("img")?.src).toBe("https://dealer.test/new.jpg");
});
