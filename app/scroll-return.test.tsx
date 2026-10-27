import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { useScrollReturn } from "@/hooks/useScrollReturn";

afterEach(() => {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
  vi.unstubAllGlobals();
});
function setup() {
  const frames = new Map<number, FrameRequestCallback>();
  let id = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++id, cb);
    return id;
  });
  vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
  const scroll = vi.fn();
  vi.stubGlobal("scrollTo", scroll);
  vi.stubGlobal("scrollY", 0);
  let controls!: ReturnType<typeof useScrollReturn>;
  function Probe() {
    controls = useScrollReturn("market-results");
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Probe />));
  const flush = () =>
    act(() => {
      const batch = Array.from(frames.values());
      frames.clear();
      batch.forEach((cb) => cb(0));
    });
  return {
    get controls() {
      return controls;
    },
    frames,
    flush,
    scroll,
    cleanup: () => act(() => root.unmount()),
  };
}
it("restores body scrolling after a dialog lock and keeps reveal observation paused until settled", () => {
  const f = setup();
  document.body.scrollTop = 1634;
  act(() => f.controls.capture());
  document.body.scrollTop = 0;
  act(() => f.controls.restore());
  expect(f.controls.restoring).toBe(true);
  f.flush();
  expect(document.body.scrollTop).toBe(1634);
  expect(f.controls.restoring).toBe(true);
  f.flush();
  expect(document.body.scrollTop).toBe(1634);
  expect(f.controls.restoring).toBe(false);
  f.cleanup();
});
it("does not restore a prior page position after navigating away", () => {
  const f = setup();
  window.history.replaceState(null, "", "/market");
  document.body.scrollTop = 1200;
  act(() => f.controls.capture());
  document.body.scrollTop = 0;
  window.history.replaceState(null, "", "/saved");
  act(() => f.controls.restore());
  f.flush();
  f.flush();
  expect(document.body.scrollTop).toBe(0);
  expect(f.scroll).not.toHaveBeenCalled();
  f.cleanup();
});
it("cancels queued restoration on unmount", () => {
  const f = setup();
  act(() => f.controls.capture());
  act(() => f.controls.restore());
  expect(f.frames.size).toBe(1);
  f.cleanup();
  expect(f.frames.size).toBe(0);
});

it("shows the updated result header when filters changed instead of restoring an old result index", () => {
  const f = setup();
  window.history.replaceState(null, "", "/market?makes=Ford");
  const target = document.createElement("section");
  target.id = "market-results";
  target.tabIndex = -1;
  target.scrollIntoView = vi.fn();
  document.body.append(target);
  act(() => f.controls.capture());
  window.history.replaceState(null, "", "/market?makes=Toyota");
  act(() => f.controls.restore());
  f.flush();
  f.flush();
  expect(target.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "instant",
  });
  expect(f.scroll).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(target);
  target.remove();
  f.cleanup();
});

it("returns to results after changing presentation even when the query is unchanged", () => {
  const f = setup();
  window.history.replaceState(null, "", "/market?makes=Ford");
  const target = document.createElement("section");
  target.id = "market-results";
  target.tabIndex = -1;
  target.scrollIntoView = vi.fn();
  document.body.append(target);
  document.body.scrollTop = 20000;
  act(() => f.controls.capture());
  act(() => f.controls.restore(true));
  f.flush();
  f.flush();
  expect(target.scrollIntoView).toHaveBeenCalledWith({
    block: "start",
    behavior: "instant",
  });
  expect(f.scroll).not.toHaveBeenCalled();
  expect(document.activeElement).toBe(target);
  target.remove();
  f.cleanup();
});
