import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketSearchActions } from "@/components/market/MarketSearchActions";
import { Btn } from "@/components/shared/Btn";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
describe("search and button task states", () => {
  it("blocks all search actions until the scope is ready", () => {
    const save = vi.fn(),
      copy = vi.fn(),
      reset = vi.fn(),
      refresh = vi.fn();
    act(() =>
      root.render(
        <MarketSearchActions
          onSave={save}
          onCopy={copy}
          onReset={reset}
          onRefresh={refresh}
          disabled
        />,
      ),
    );
    const buttons = Array.from(host.querySelectorAll("button"));
    expect(buttons).toHaveLength(5);
    expect(buttons.every((b) => b.disabled)).toBe(true);
    act(() => buttons.forEach((b) => b.click()));
    for (const fn of [save, copy, reset, refresh])
      expect(fn).not.toHaveBeenCalled();
  });
  it("marks a real refresh busy while keeping unrelated actions available", () => {
    const refresh = vi.fn();
    act(() =>
      root.render(
        <MarketSearchActions
          onSave={() => {}}
          onCopy={() => {}}
          onReset={() => {}}
          onRefresh={refresh}
          refreshing
        />,
      ),
    );
    const button = host.querySelector<HTMLButtonElement>(
      '[aria-label="Refresh results"]',
    )!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(
      host.querySelector<HTMLButtonElement>(
        '[aria-label="Save search on this device"]',
      )!.disabled,
    ).toBe(false);
    act(() => button.click());
    expect(refresh).not.toHaveBeenCalled();
  });
  it("announces loading and prevents double activation even with a conflicting caller busy flag", () => {
    const click = vi.fn();
    act(() =>
      root.render(
        <Btn loading aria-busy={false} onClick={click}>
          Save
        </Btn>,
      ),
    );
    const button = host.querySelector("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector('[aria-hidden="true"]')).not.toBeNull();
    act(() => button.click());
    expect(click).not.toHaveBeenCalled();
    act(() => root.render(<Btn onClick={click}>Save</Btn>));
    expect(button.hasAttribute("aria-busy")).toBe(false);
    act(() => button.click());
    expect(click).toHaveBeenCalledOnce();
  });
});
