import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MarketQuickFilters } from "@/components/market/MarketQuickFilters";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({ matches: true }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function render(disabled = false, sourceBusy = false) {
  act(() =>
    root.render(
      <MarketQuickFilters
        disabled={disabled}
        fields={[
          {
            key: "make",
            label: "Make",
            value: "Ford",
            inputLabel: "Quick make",
          },
          {
            key: "miles",
            label: "Mileage",
            value: "50000 mi",
            inputLabel: "Quick mileage",
          },
          {
            key: "source",
            label: "Source",
            value: "All",
            inputLabel: "Quick source",
            disabled: sourceBusy,
          },
        ]}
      >
        <input aria-label="Quick make" defaultValue="Ford" />
        <input aria-label="Quick mileage" defaultValue="50000" />
        <select aria-label="Quick source">
          <option>All</option>
        </select>
      </MarketQuickFilters>,
    ),
  );
}
const button = (label: string) =>
  host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;

it("opens the requested field and preserves the same entered control across close/reopen", () => {
  render();
  const trigger = button("Edit mileage: 50000 mi");
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  act(() => trigger.click());
  const input = host.querySelector<HTMLInputElement>(
    '[aria-label="Quick mileage"]',
  )!;
  expect(document.activeElement).toBe(input);
  input.value = "42000";
  act(() =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent === "Done with quick filters")!
      .click(),
  );
  expect(document.activeElement).toBe(trigger);
  expect(trigger.getAttribute("aria-expanded")).toBe("false");
  act(() => trigger.click());
  expect(host.querySelector('[aria-label="Quick mileage"]')).toBe(input);
  expect(input.value).toBe("42000");
});

it("moves directly between fields and returns keyboard focus on Escape", () => {
  render();
  act(() => button("Edit make: Ford").click());
  expect(document.activeElement).toBe(
    host.querySelector('[aria-label="Quick make"]'),
  );
  const miles = button("Edit mileage: 50000 mi");
  act(() => miles.click());
  act(() =>
    document.activeElement!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(miles.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(miles);
});

it("disables only busy fields while retaining other quick edits", () => {
  render(false, true);
  expect(button("Edit source: All").disabled).toBe(true);
  expect(button("Edit make: Ford").disabled).toBe(false);
  render(true);
  expect(button("Edit make: Ford").disabled).toBe(true);
});

it("does not redirect desktop Escape focus to an invisible mobile shortcut", () => {
  render();
  act(() => button("Edit make: Ford").click());
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  const input = document.activeElement;
  act(() =>
    input!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    ),
  );
  expect(document.activeElement).toBe(input);
});
