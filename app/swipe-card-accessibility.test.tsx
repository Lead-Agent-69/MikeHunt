import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SwipeCardStack } from "@/components/ui/framer-components";

let host: HTMLDivElement;
let root: Root;
const onSave = vi.fn();
const onPass = vi.fn();
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  onSave.mockReset();
  onPass.mockReset();
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 360, 380),
  );
  act(() =>
    root.render(
      <SwipeCardStack
        cards={["First", "Second"].map((name) => ({
          id: name,
          content: (
            <>
              <button type="button">Review {name}</button>
              <a href={`/${name.toLowerCase()}`}>Open {name}</a>
            </>
          ),
        }))}
        onSave={onSave}
        onPass={onPass}
      />,
    ),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps uncommitted visual SAVE/PASS stamps out of the accessibility tree", () => {
  const stamps = Array.from(host.querySelectorAll("span")).filter((node) =>
    /^(SAVE ✓|PASS ✗)$/.test(node.textContent?.trim() || ""),
  );
  expect(stamps).toHaveLength(2);
  for (const stamp of stamps)
    expect(stamp.closest('[aria-hidden="true"]')).not.toBeNull();
});

it("makes the departing card's copied links and buttons inert", () => {
  act(() =>
    host
      .querySelector<HTMLButtonElement>('button[aria-label="Save this deal"]')!
      .click(),
  );
  expect(onSave).toHaveBeenCalledExactlyOnceWith("First");
  const departing = host.querySelector<HTMLElement>(
    'div.pointer-events-none[aria-hidden="true"]',
  );
  expect(departing?.querySelector("a")?.textContent).toBe("Open First");
  expect(departing?.inert).toBe(true);
  expect(
    host.querySelector<HTMLButtonElement>('button[aria-label="Save this deal"]')
      ?.disabled,
  ).toBe(true);
});

it("keeps nested controls' arrow keys native and accepts one keyboard decision", () => {
  const nested = new KeyboardEvent("keydown", {
    key: "ArrowRight",
    bubbles: true,
    cancelable: true,
  });
  act(() => host.querySelector("button")!.dispatchEvent(nested));
  expect(nested.defaultPrevented).toBe(false);
  expect(onSave).not.toHaveBeenCalled();
  const group = host.querySelector('[role="group"]')!;
  act(() =>
    group.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  act(() =>
    group.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "ArrowRight",
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(onSave).toHaveBeenCalledExactlyOnceWith("First");
  expect(onPass).not.toHaveBeenCalled();
});
