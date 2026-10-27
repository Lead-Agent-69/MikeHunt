import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const control = vi.hoisted(() => ({
  saved: true,
  busy: false,
  label: "Remove from account",
  toggle: vi.fn(),
}));
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => control,
}));
import { FeedVehicleCard } from "@/components/feed/FeedVehicleCard";
let host: HTMLDivElement;
let root: Root;
const render = () =>
  act(() =>
    root.render(
      <FeedVehicleCard
        item={{
          id: "feed",
          title: "Ford Escape",
          source: "cars_com",
          image: "https://photos.example/car.jpg",
        }}
      />,
    ),
  );
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  control.saved = true;
  control.busy = false;
  control.label = "Remove from account";
  control.toggle.mockClear();
  render();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("uses shared membership truth and supports removal instead of a one-shot save", () => {
  const button = host.querySelector<HTMLButtonElement>("[aria-pressed]")!;
  expect(button.getAttribute("aria-pressed")).toBe("true");
  act(() => button.click());
  expect(control.toggle).toHaveBeenCalledTimes(1);
  control.saved = false;
  control.label = "Save to account";
  render();
  expect(button.getAttribute("aria-pressed")).toBe("false");
  expect(button.getAttribute("aria-label")).toContain("Save to account");
});
it("prevents a second action while the shared owner-scoped save is pending", () => {
  control.busy = true;
  render();
  const button = host.querySelector<HTMLButtonElement>("[aria-pressed]")!;
  expect(button.disabled).toBe(true);
  act(() => button.click());
  expect(control.toggle).not.toHaveBeenCalled();
});
