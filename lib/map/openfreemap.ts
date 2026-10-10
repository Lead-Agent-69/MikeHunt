/**
 * OpenFreeMap basemap config (https://openfreemap.org): free vector tiles, no API key, no usage
 * limits. Styles are MapLibre GL style JSON served from tiles.openfreemap.org.
 */
export const OPENFREEMAP_ORIGIN = "https://tiles.openfreemap.org";

export const OPENFREEMAP_STYLES = {
  liberty: `${OPENFREEMAP_ORIGIN}/styles/liberty`,
  bright: `${OPENFREEMAP_ORIGIN}/styles/bright`,
  positron: `${OPENFREEMAP_ORIGIN}/styles/positron`,
  dark: `${OPENFREEMAP_ORIGIN}/styles/dark`,
} as const;

export type MapTheme = "light" | "dark";

/** Liberty is the default; the app's dark theme gets OpenFreeMap's dark style. */
export function openFreeMapStyleFor(theme: MapTheme): string {
  return theme === "dark"
    ? OPENFREEMAP_STYLES.dark
    : OPENFREEMAP_STYLES.liberty;
}

/** Attribution OpenFreeMap requires (same text the tile source's TileJSON declares). */
export const OPENFREEMAP_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>';
