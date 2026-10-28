// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  map: {
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    fitBounds: vi.fn(),
    getSize: () => ({ x: 390, y: 500 }),
    on: vi.fn(),
    off: vi.fn(),
  },
  marker: vi.fn(),
  clusterOptions: [] as Array<Record<string, unknown>>,
  clusterAdds: [] as Array<unknown[]>,
  clusterClears: vi.fn(),
  previews: [] as Array<{
    open: boolean;
    handlers: Map<string, (event?: any) => void>;
    element: HTMLElement;
    options: { autoPan: boolean; maxHeight?: number };
    updates: number;
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
    markerClusterGroup: (options: Record<string, unknown>) => {
      state.clusterOptions.push(options);
      return {
        addLayers: (markers: unknown[]) => state.clusterAdds.push(markers),
        clearLayers: state.clusterClears,
      };
    },
    marker: (...args: unknown[]) => {
      state.marker(...args);
      const preview = {
        open: false,
        handlers: new Map<string, (event?: any) => void>(),
        element: document.createElement("div"),
        options: { autoPan: true },
        updates: 0,
      };
      state.previews.push(preview);
      const marker = {
        bindPopup: vi.fn((_html: string, options: Record<string, unknown>) => {
          Object.assign(preview.options, options);
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
        isPopupOpen: () => preview.open,
        getPopup: () => ({
          getElement: () => preview.element,
          options: preview.options,
          update: () => {
            preview.updates++;
          },
        }),
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
    expect(state.clusterOptions.at(-1)).toMatchObject({
      chunkedLoading: true,
      chunkInterval: 100,
      chunkDelay: 24,
    });
    expect(state.clusterAdds.at(-1)).toHaveLength(1);
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
    expect(state.clusterAdds.at(-1)).toHaveLength(2);
  } finally {
    await act(async () => root.unmount());
  }
});

it("bulk-adds a nationwide result set instead of indexing each marker separately", async () => {
  const host = document.createElement("div");
  const root = createRoot(host);
  const points = Array.from({ length: 2000 }, (_, index) => ({
    id: `car-${index}`,
    name: `Car ${index}`,
    lat: 25 + (index % 100) * 0.2,
    lng: -124 + (index % 200) * 0.3,
  }));
  try {
    await act(async () => root.render(<DealerMap points={points} />));
    expect(state.clusterAdds.at(-1)).toHaveLength(2000);
    expect(state.map.addLayer).toHaveBeenCalledWith(expect.any(Object));
  } finally {
    await act(async () => root.unmount());
  }
  expect(state.clusterClears).toHaveBeenCalled();
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
    expect(preview.options).toMatchObject({
      autoPanPaddingTopLeft: [12, 112],
      autoPanPaddingBottomRight: [12, 16],
      keepInView: true,
      maxHeight: 340,
    });
    preview.handlers.get("popupopen")!();
    const resize = state.map.on.mock.calls.at(-1)![1] as () => void;
    const beforeResize = preview.updates;
    const size = vi
      .spyOn(state.map, "getSize")
      .mockReturnValue({ x: 320, y: 400 });
    try {
      resize();
      expect(preview.options.maxHeight).toBe(240);
    } finally {
      size.mockRestore();
    }
    expect(preview.updates).toBe(beforeResize + 1);
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
    const preventScroll = vi.fn();
    preview.handlers.get("keypress")!({
      originalEvent: { key: " ", preventDefault: preventScroll },
    });
    expect(preventScroll).toHaveBeenCalledOnce();
    expect(preview.open).toBe(true);
    preview.handlers.get("mouseover")!();
    expect(preview.options.autoPan).toBe(false);
    const beforeClick = preview.updates;
    preview.handlers.get("click")!();
    expect(preview.options.autoPan).toBe(true);
    expect(preview.updates).toBe(beforeClick + 1);
    expect(preview.open).toBe(true);
    expect(selected).toHaveBeenLastCalledWith("car");
    preview.handlers.get("popupclose")!();
    const afterClose = preview.updates;
    resize();
    expect(preview.updates).toBe(afterClose);
  } finally {
    await act(async () => root.unmount());
  }
});
