// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  map: { addLayer: vi.fn(), removeLayer: vi.fn(), fitBounds: vi.fn() },
  marker: vi.fn(),
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
      return { bindPopup: vi.fn(), on: vi.fn() };
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
