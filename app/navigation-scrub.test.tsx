import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNavigationScrub } from "@/hooks/useNavigationScrub";

let host: HTMLDivElement;
let root: Root;
const navigate = vi.fn();
let captured = false;
function Harness({ route = "/market", selected = 0 }) {
  const scrub = useNavigationScrub(selected, 5, route, navigate);
  return (
    <div
      {...scrub.handlers}
      data-preview={scrub.preview}
      data-pressed={scrub.pressed}
    >
      <a href="/market">Market</a>
      <a href="/saved">Saved</a>
    </div>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  navigate.mockReset();
  captured = false;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
  const bar = host.firstElementChild as HTMLElement;
  vi.spyOn(bar, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 408, 64),
  );
  bar.setPointerCapture = vi.fn(() => {
    captured = true;
  });
  bar.hasPointerCapture = vi.fn(() => captured);
  bar.releasePointerCapture = vi.fn(() => {
    captured = false;
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function pointer(type: string, x: number, y = 32, overrides = {}) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperties(
    event,
    Object.fromEntries(
      Object.entries({ pointerId: 1, isPrimary: true, ...overrides }).map(
        ([key, value]) => [key, { value }],
      ),
    ),
  );
  act(() => host.firstElementChild!.dispatchEvent(event));
}
function click(detail = 1) {
  const event = new MouseEvent("click", {
    bubbles: true,
    cancelable: true,
    detail,
  });
  // Prevent jsdom's actual navigation, after recording the nav capture handler result.
  let prevented = true;
  host.addEventListener(
    "click",
    (e) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    },
    { once: true },
  );
  act(() => host.querySelector("a")!.dispatchEvent(event));
  return prevented;
}

describe("mobile navigation scrub", () => {
  it("previews while dragging, commits once on release and suppresses the origin link", () => {
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    expect(host.firstElementChild?.getAttribute("data-preview")).toBe("3");
    expect(navigate).not.toHaveBeenCalled();
    pointer("pointerup", 284);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(3);
    expect(captured).toBe(false);
    expect(click()).toBe(true);
    pointer("pointerup", 284);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it("keeps taps, small hand tremors, keyboard and modified clicks native", () => {
    pointer("pointerdown", 44);
    pointer("pointermove", 48);
    pointer("pointerup", 48);
    expect(click()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    pointer("pointerdown", 44, 32, { ctrlKey: true });
    pointer("pointermove", 284);
    pointer("pointerup", 284);
    expect(navigate).not.toHaveBeenCalled();
    expect(click()).toBe(false);
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    pointer("pointercancel", 284);
    expect(click(0)).toBe(false);
    pointer("pointerdown", 44, 32, { ctrlKey: true });
    pointer("pointerup", 44, 32, { ctrlKey: true });
    expect(click()).toBe(false);
  });
  it("cancels a vertical scroll or release outside the dock", () => {
    pointer("pointerdown", 44);
    pointer("pointermove", 46, 60);
    pointer("pointerup", 46, 60);
    expect(navigate).not.toHaveBeenCalled();
    expect(click()).toBe(true);
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    pointer("pointerup", 500);
    expect(navigate).not.toHaveBeenCalled();
    expect(captured).toBe(false);
  });
  it("cancels multi-touch, pointer loss, Escape and browser pointer cancellation", () => {
    for (const cancellation of [
      "pointercancel",
      "lostpointercapture",
      "escape",
      "multitouch",
    ]) {
      pointer("pointerdown", 44);
      pointer("pointermove", 284);
      if (cancellation === "escape")
        act(() =>
          host.firstElementChild!.dispatchEvent(
            new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
          ),
        );
      else if (cancellation === "multitouch")
        pointer("pointerdown", 120, 32, { isPrimary: false, pointerId: 2 });
      else pointer(cancellation, 284);
      pointer("pointerup", 284);
      expect(navigate).not.toHaveBeenCalled();
      expect(host.firstElementChild?.getAttribute("data-preview")).toBeNull();
    }
  });
  it("ignores another pointer and avoids navigating to the already-selected destination", () => {
    pointer("pointerdown", 44);
    pointer("pointermove", 284, 32, { pointerId: 2 });
    pointer("pointerup", 284, 32, { pointerId: 2 });
    expect(navigate).not.toHaveBeenCalled();
    pointer("pointermove", 58);
    pointer("pointerup", 58);
    expect(navigate).not.toHaveBeenCalled();
  });
  it("invalidates a gesture on route changes and releases capture on unmount", () => {
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    act(() => root.render(<Harness route="/saved" selected={2} />));
    pointer("pointerup", 284);
    expect(navigate).not.toHaveBeenCalled();
    expect(captured).toBe(false);
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    act(() => root.render(null));
    expect(captured).toBe(false);
  });
  it("clears a held press when the pointer leaves before capture or the window loses focus", () => {
    pointer("pointerdown", 44);
    pointer("pointerout", 500);
    expect(host.firstElementChild?.getAttribute("data-pressed")).toBe("false");
    pointer("pointerup", 284);
    expect(navigate).not.toHaveBeenCalled();
    pointer("pointerdown", 44);
    pointer("pointermove", 284);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(captured).toBe(false);
    pointer("pointerup", 284);
    expect(navigate).not.toHaveBeenCalled();
  });
});
