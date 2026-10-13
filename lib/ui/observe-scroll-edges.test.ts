import { afterEach, expect, it, vi } from "vitest";
import { observeScrollEdges } from "./observe-scroll-edges";

afterEach(() => vi.unstubAllGlobals());

function fixture() {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  let resize = () => {};
  const disconnect = vi.fn();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => {
    frames.set(++id, fn);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(fn: () => void) {
        resize = fn;
      }
      observe() {}
      disconnect = disconnect;
    },
  );
  const element = document.createElement("div");
  Object.defineProperties(element, {
    clientWidth: { value: 300, configurable: true },
    scrollWidth: { value: 1200, configurable: true },
  });
  const publish = vi.fn();
  const cleanup = observeScrollEdges(element, publish);
  const flush = () => {
    const scheduled = Array.from(frames.values());
    frames.clear();
    scheduled.forEach((fn) => fn(0));
  };
  return {
    element,
    publish,
    cleanup,
    frames,
    flush,
    resize: () => resize(),
    disconnect,
  };
}

it("coalesces scroll and resize bursts and publishes only changed edges", () => {
  const f = fixture();
  expect(f.publish).toHaveBeenLastCalledWith({ start: true, end: false });
  for (let i = 0; i < 100; i++) f.element.dispatchEvent(new Event("scroll"));
  f.resize();
  expect(f.frames.size).toBe(1);
  f.flush();
  expect(f.publish).toHaveBeenCalledTimes(1);
  f.element.scrollLeft = 100;
  f.element.dispatchEvent(new Event("scroll"));
  f.flush();
  expect(f.publish).toHaveBeenLastCalledWith({ start: false, end: false });
  for (let i = 0; i < 100; i++) {
    f.element.scrollLeft = 100 + i;
    f.element.dispatchEvent(new Event("scroll"));
    f.flush();
  }
  expect(f.publish).toHaveBeenCalledTimes(2);
  f.element.scrollLeft = 900;
  f.element.dispatchEvent(new Event("scroll"));
  f.flush();
  expect(f.publish).toHaveBeenLastCalledWith({ start: false, end: true });
  f.cleanup();
});

it("recalculates on resize and clamps elastic overscroll at either edge", () => {
  const f = fixture();
  f.element.scrollLeft = -20;
  f.resize();
  f.flush();
  expect(f.publish).toHaveBeenCalledTimes(1);
  f.element.scrollLeft = 950;
  f.resize();
  f.flush();
  expect(f.publish).toHaveBeenLastCalledWith({ start: false, end: true });
  f.element.scrollLeft = 0;
  Object.defineProperty(f.element, "scrollWidth", { value: 300 });
  f.resize();
  f.flush();
  expect(f.publish).toHaveBeenLastCalledWith({ start: true, end: true });
  f.cleanup();
});

it("cancels pending frames and disconnects observers on cleanup", () => {
  const f = fixture();
  f.element.dispatchEvent(new Event("scroll"));
  f.cleanup();
  expect(f.frames.size).toBe(0);
  expect(f.disconnect).toHaveBeenCalledOnce();
  f.element.dispatchEvent(new Event("scroll"));
  expect(f.frames.size).toBe(0);
  f.resize();
  expect(f.frames.size).toBe(0);
});
