// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  map: { addLayer: vi.fn(), removeLayer: vi.fn(), fitBounds: vi.fn() },
  marker: vi.fn(),
  previews: [] as Array<{
    open: boolean;
    handlers: Map<string, (event?: any) => void>;
    element: HTMLElement;
  }>,
}));
vi.mock("react-leaflet", () => ({
  MapContainer: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  TileLayer: () => null,
  ZoomControl: () => null,
  useMap: () => state.map,
}));
vi.mock("leaflet", () => ({
  default: {
    Icon: { Default: Object.assign(function () {}, { mergeOptions: vi.fn() }) },
    DivIcon: class {},
    markerClusterGroup: () => ({ addLayer: vi.fn() }),
    marker: (...args: unknown[]) => {
      state.marker(...args);
      const preview = {
        open: false,
        handlers: new Map<string, (event?: any) => void>(),
        element: document.createElement("div"),
      };
      state.previews.push(preview);
      const marker = {
        bindPopup: vi.fn(() => {
          preview.handlers.set("click", () => {
            preview.open = !preview.open;
          });
          preview.handlers.set("keypress", () => {
            preview.open = !preview.open;
          });
        }),
        off: vi.fn((events: string) =>
          events.split(" ").forEach((name) => preview.handlers.delete(name)),
        ),
        on: vi.fn((events: string, handler: (event?: any) => void) =>
          events
            .split(" ")
            .forEach((name) => preview.handlers.set(name, handler)),
        ),
        openPopup: vi.fn(() => {
          preview.open = true;
        }),
        getElement: () => preview.element,
      };
      return marker;
    },
    latLngBounds: vi.fn(),
  },
}));
vi.mock("leaflet.markercluster", () => ({}));
import DealerMap from "@/components/map/DealerMap";

it("retains marker groups on unrelated renders and rebuilds only for changed inventory", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const points = [{ id: "one", name: "A car", lat: 38, lng: -90 }];
  try {
    await act(async () => root.render(<DealerMap points={points} />));
    const built = state.map.addLayer.mock.calls.length;
    const removed = state.map.removeLayer.mock.calls.length;
    const fitted = state.map.fitBounds.mock.calls.length;
    expect(built).toBeGreaterThan(0);
    await act(async () => root.render(<DealerMap points={points} />));
    expect(state.map.addLayer).toHaveBeenCalledTimes(built);
    expect(state.map.removeLayer).toHaveBeenCalledTimes(removed);
    expect(state.map.fitBounds).toHaveBeenCalledTimes(fitted);
    await act(async () =>
      root.render(
        <DealerMap
          points={[
            ...points,
            { id: "two", name: "Another car", lat: 39, lng: -91 },
          ]}
        />,
      ),
    );
    expect(state.map.addLayer).toHaveBeenCalledTimes(built + 1);
    expect(state.map.removeLayer).toHaveBeenCalledTimes(removed + 1);
    expect(state.map.fitBounds).toHaveBeenCalledTimes(fitted + 1);
  } finally {
    await act(async () => root.unmount());
  }
});

it("keeps hover/focus previews open when a marker is clicked or activated with Enter", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  try {
    const selected = vi.fn();
    await act(async () =>
      root.render(
        <DealerMap
          points={[{ id: "car", name: "Car", lat: 38, lng: -90 }]}
          onPointSelect={selected}
        />,
      ),
    );
    const preview = state.previews.at(-1)!;
    preview.handlers.get("add")!();
    preview.element.dispatchEvent(new Event("focus"));
    expect(preview.open).toBe(true);
    preview.handlers.get("keypress")!({ originalEvent: { key: "Enter" } });
    expect(preview.open).toBe(true);
    preview.handlers.get("click")!();
    expect(preview.open).toBe(true);
    preview.open = false;
    preview.handlers.get("keypress")!({ originalEvent: { key: "x" } });
    expect(preview.open).toBe(false);
    preview.handlers.get("mouseover")!();
    preview.handlers.get("click")!();
    expect(preview.open).toBe(true);
    expect(selected).toHaveBeenLastCalledWith("car");
  } finally {
    await act(async () => root.unmount());
  }
});
