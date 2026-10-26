import { afterEach, describe, expect, it, vi } from "vitest";
import { observeScrollReveal } from "./observe-scroll-reveal";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.scrollTop = 0;
});
function setup(initialVisible = false, initialBottom = -100) {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  let y = 1200;
  let bottom = initialBottom;
  let focused = false;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  vi.stubGlobal("scrollY", 0);
  const anchor = document.createElement("div");
  anchor.getBoundingClientRect = () => ({ bottom }) as DOMRect;
  const publish = vi.fn();
  document.body.scrollTop = y;
  const cleanup = observeScrollReveal(
    anchor,
    publish,
    () => focused,
    initialVisible,
  );
  const flush = () => {
    const batch = Array.from(frames.values());
    frames.clear();
    batch.forEach((cb) => cb(0));
  };
  const move = (next: number) => {
    y = next;
    document.body.scrollTop = y;
    document.body.dispatchEvent(new Event("scroll"));
    flush();
  };
  return {
    publish,
    move,
    cleanup,
    frames,
    flush,
    showOriginal: () => {
      bottom = 100;
    },
    focus: (next: boolean) => {
      focused = next;
    },
  };
}
describe("scroll-revealed search access", () => {
  it("yields to visible original controls when reattaching after a filter shrinks the results", () => {
    const f = setup(true, 200);
    expect(f.publish).toHaveBeenLastCalledWith(false);
    f.cleanup();
  });
  it("reveals after 24px up, hides after 48px down, and ignores small reversals", () => {
    const f = setup();
    f.move(1500);
    expect(f.publish).not.toHaveBeenCalled();
    f.move(1490);
    f.move(1477);
    expect(f.publish).not.toHaveBeenCalled();
    f.move(1476);
    expect(f.publish).toHaveBeenLastCalledWith(true);
    f.move(1480);
    f.move(1478);
    expect(f.publish).toHaveBeenCalledTimes(1);
    f.move(1500);
    f.move(1526);
    expect(f.publish).toHaveBeenLastCalledWith(false);
    f.cleanup();
  });
  it("keeps the bar visible while typing and returns to the ordinary controls near the top", () => {
    const f = setup();
    f.move(1170);
    f.focus(true);
    f.move(1400);
    expect(f.publish).toHaveBeenCalledTimes(1);
    f.focus(false);
    f.showOriginal();
    f.move(1380);
    expect(f.publish).toHaveBeenLastCalledWith(false);
    f.cleanup();
  });
  it("retains visibility across a filter overlay and hides on subsequent downward travel", () => {
    const f = setup(true);
    f.move(1248);
    expect(f.publish).toHaveBeenLastCalledWith(false);
    f.cleanup();
  });
  it("coalesces scroll bursts into one frame and cleans up pending work", () => {
    const f = setup();
    for (let i = 0; i < 30; i++)
      document.body.dispatchEvent(new Event("scroll"));
    expect(f.frames.size).toBe(1);
    f.cleanup();
    expect(f.frames.size).toBe(0);
    document.body.dispatchEvent(new Event("scroll"));
    expect(f.frames.size).toBe(0);
  });
});
