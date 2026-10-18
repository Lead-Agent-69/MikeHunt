"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "mh-photo-selection-v1";
const MAX_AGE = 24 * 60 * 60 * 1000;
const listeners = new Set<() => void>();
let unavailableStorage = "";
let pendingStorage: string | null = null;
type Selection = { scope: string; gallery: string; src: string; at: number };

function snapshot() {
  if (pendingStorage !== null) return pendingStorage;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return unavailableStorage;
  }
}
function records(raw: string): Selection[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is Selection =>
              item &&
              typeof item.scope === "string" &&
              typeof item.gallery === "string" &&
              typeof item.src === "string" &&
              typeof item.at === "number" &&
              item.at <= Date.now() &&
              Date.now() - item.at < MAX_AGE,
          )
          .slice(-80)
      : [];
  } catch {
    return [];
  }
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Remember URLs, not offsets. A changed gallery or listing starts at its first photo. */
export function usePhotoSelection(images: string[], listingId?: string) {
  const raw = useSyncExternalStore(subscribe, snapshot, () => "");
  const scope = listingId || images[0] || "";
  const gallery = JSON.stringify(images);
  const selected = records(raw).find(
    (item) => item.scope === scope && item.gallery === gallery,
  );
  const index = Math.max(0, images.indexOf(selected?.src || ""));
  return {
    index,
    select(nextIndex: number) {
      const src = images[nextIndex];
      if (!scope || !src) return;
      const next = records(snapshot()).filter((item) => item.scope !== scope);
      next.push({ scope, gallery, src, at: Date.now() });
      const encoded = JSON.stringify(next.slice(-80));
      unavailableStorage = encoded;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, encoded);
        pendingStorage = null;
      } catch {
        pendingStorage = encoded;
        // Private mode / full storage still keeps selection for this page's lifetime.
      }
      listeners.forEach((listener) => listener());
    },
  };
}
