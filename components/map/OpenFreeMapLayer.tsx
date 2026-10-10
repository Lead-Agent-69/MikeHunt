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

  useEffect(() => {
    const layer = maplibreGL({
      style: openFreeMapStyleFor(readTheme()),
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
    const gl = layerRef.current?.getMaplibreMap();
    if (gl) gl.setStyle(openFreeMapStyleFor(theme));
  }, [theme]);

  return null;
}
