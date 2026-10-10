"use client";

import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import "maplibre-gl/dist/maplibre-gl.css";
import { maplibreGL } from "@maplibre/maplibre-gl-leaflet";
import {
  OPENFREEMAP_ATTRIBUTION,
  openFreeMapStyleFor,
  type MapTheme,
} from "@/lib/map/openfreemap";

function readTheme(): MapTheme {
  if (typeof document === "undefined") return "dark";
  return document.documentElement.getAttribute("data-theme") === "light"
    ? "light"
    : "dark";
}

/** Tracks the app's data-theme attribute on <html> (set by the root layout's theme script). */
export function useAppTheme(): MapTheme {
  const [theme, setTheme] = useState<MapTheme>(readTheme);
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setTheme(readTheme()));
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

/**
 * OpenFreeMap vector basemap rendered by MapLibre GL inside the existing Leaflet map, so Leaflet
 * markers, clustering and popups keep working unchanged on top of it.
 */
export default function OpenFreeMapLayer({ theme }: { theme: MapTheme }) {
  const map = useMap();
  const layerRef = useRef<L.MaplibreGL | null>(null);
  const styleRef = useRef<string | null>(null);

  useEffect(() => {
    // The old raster TileLayer implicitly gave Leaflet a maxZoom; a GL layer does not, and
    // leaflet.markercluster throws "Map has no maxZoom specified" without one.
    if (!map.options.maxZoom) map.setMaxZoom(19);
    if (map.options.minZoom == null) map.setMinZoom(2);
    styleRef.current = openFreeMapStyleFor(readTheme());
    const layer = maplibreGL({
      style: styleRef.current,
      // Fixed attribution so it stays correct across light/dark style swaps.
      attributionControl: { customAttribution: OPENFREEMAP_ATTRIBUTION },
    });
    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const next = openFreeMapStyleFor(theme);
    const gl = layerRef.current?.getMaplibreMap();
    if (gl && styleRef.current !== next) {
      styleRef.current = next;
      gl.setStyle(next);
    }
  }, [theme]);

  return null;
}
