import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MarketLocation } from "@/components/market/MarketLocation";
import {
  EMPTY_SEARCH_AREA,
  type SearchAreaValue,
} from "@/lib/search/area-scope";
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ prefs: {} }),
}));
let root: Root;
let host: HTMLDivElement;
let changed = vi.fn((value: SearchAreaValue) => value);
let gps: PositionCallback | undefined;
const originalGeo = navigator.geolocation;
const button = (name: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (el) => el.textContent?.trim() === name,
  )!;
const mode = (name: string) =>
  act(() =>
    Simulate.change(
      document.querySelector<HTMLInputElement>(
        `input[type=radio][value=${name}]`,
      )!,
      { target: { checked: true } } as any,
    ),
  );
const open = () =>
  act(() =>
    document
      .querySelector<HTMLButtonElement>("#market-search-area-trigger")!
      .click(),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  changed = vi.fn();
  gps = undefined;
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: {
      getCurrentPosition: vi.fn((success: PositionCallback) => {
        gps = success;
      }),
    },
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: originalGeo,
  });
  vi.unstubAllGlobals();
});
async function render() {
  function Harness() {
    const [value, setValue] = useState(EMPTY_SEARCH_AREA);
    return (
      <MarketLocation
        value={value}
        onChange={(next) => {
          changed(next);
          setValue(next);
        }}
      />
    );
  }
  await act(async () => {
    root.render(<Harness />);
  });
}
describe("single search area picker", () => {
  it("does not display an active radius for Nationwide, including after reopening", async () => {
    await render();
    open();
    expect(document.querySelector('[aria-label="Search radius"]')).toBeNull();
    expect(document.querySelector('[aria-label="Search location"]')).toBeNull();
    mode("nearby");
    expect(
      document.querySelector('[aria-label="Search radius"]'),
    ).not.toBeNull();
    expect(button("Apply area").disabled).toBe(true);
    mode("nationwide");
    act(() => button("Apply area").click());
    open();
    expect(document.querySelector('[aria-label="Search radius"]')).toBeNull();
    expect(changed).toHaveBeenLastCalledWith(EMPTY_SEARCH_AREA);
  });
  it("discards edits on Cancel and does not allow an empty States choice to broaden a search", async () => {
    await render();
    open();
    mode("states");
    expect(button("Apply area").disabled).toBe(true);
    act(() => button("Cancel").click());
    open();
    expect(
      document.querySelector<HTMLInputElement>(
        "input[type=radio][value=nationwide]",
      )!.checked,
    ).toBe(true);
    expect(changed).not.toHaveBeenCalled();
  });
  it("ignores a delayed location callback after choosing Nationwide", async () => {
    await render();
    open();
    mode("nearby");
    act(() => button("Use my location").click());
    expect(gps).toBeDefined();
    mode("nationwide");
    act(() =>
      gps!({
        coords: { latitude: 38.6, longitude: -90.2 },
      } as GeolocationPosition),
    );
    expect(document.querySelector('[aria-label="Search radius"]')).toBeNull();
    act(() => button("Apply area").click());
    expect(changed).toHaveBeenLastCalledWith(EMPTY_SEARCH_AREA);
  });
  it("clears coordinates and radius for selected states", async () => {
    await render();
    open();
    mode("states");
    const box = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[type=checkbox]"),
    ).find((el) => el.parentElement!.textContent!.includes("Missouri"))!;
    act(() => Simulate.change(box, { target: { checked: true } } as any));
    act(() => button("Apply area").click());
    expect(changed).toHaveBeenLastCalledWith({
      ...EMPTY_SEARCH_AREA,
      states: ["MO"],
    });
  });
});
