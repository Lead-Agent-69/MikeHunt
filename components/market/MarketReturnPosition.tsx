"use client";

import { useEffect } from "react";

const HISTORY_KEY = "marketReturnPosition";
const STORAGE_KEY = "mh-market-return-position-v1";
const MAX_AGE_MS = 30 * 60 * 1000;
const MAX_RESTORE_FRAMES = 240;

type SavedMarketPosition = {
  url: string;
  id: string;
  top: number;
  savedAt: number;
};

function isSavedMarketPosition(value: unknown): value is SavedMarketPosition {
  if (!value || typeof value !== "object") return false;
  const saved = value as Partial<SavedMarketPosition>;
  return (
    typeof saved.url === "string" &&
    typeof saved.id === "string" &&
    Number.isFinite(saved.top) &&
    Number.isFinite(saved.savedAt) &&
    Date.now() - Number(saved.savedAt) <= MAX_AGE_MS
  );
}

function readStoredPosition(): SavedMarketPosition | null {
  try {
    const parsed = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) || "null",
    );
    if (isSavedMarketPosition(parsed)) return parsed;
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled; history state remains the primary path.
  }
  return null;
}

function readSavedPosition(): SavedMarketPosition | null {
  const historyPosition = window.history.state?.[HISTORY_KEY];
  return isSavedMarketPosition(historyPosition)
    ? historyPosition
    : readStoredPosition();
}

function consumeSavedPosition() {
  const state = { ...window.history.state };
  delete state[HISTORY_KEY];
  window.history.replaceState(state, "");
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be disabled without breaking navigation.
  }
}

export function rememberMarketPosition(card: HTMLElement | null) {
  if (!card?.dataset.marketVehicle) return;
  const saved: SavedMarketPosition = {
    url: window.location.pathname + window.location.search,
    id: card.dataset.marketVehicle,
    top: card.getBoundingClientRect().top,
    savedAt: Date.now(),
  };
  window.history.replaceState(
    {
      ...window.history.state,
      [HISTORY_KEY]: saved,
    },
    "",
  );
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // History state still preserves the position when storage is unavailable.
  }
}

// Native restoration and the App Router's preserved activity can both run before
// asynchronous results regain their height. Retry until the exact card is ready,
// and listen for a history return because React may preserve this component.
export function MarketReturnPosition() {
  useEffect(() => {
    let frame = 0;
    let attempts = 0;
    let stableFrames = 0;
    let disposed = false;

    const attemptRestore = () => {
      if (disposed) return;
      const saved = readSavedPosition();
      if (!saved) return;
      if (saved.url !== window.location.pathname + window.location.search)
        return;

      const card = Array.from(
        document.querySelectorAll<HTMLElement>("[data-market-vehicle]"),
      ).find((element) => element.dataset.marketVehicle === saved.id);
      if (!card) {
        attempts += 1;
        if (attempts < MAX_RESTORE_FRAMES)
          frame = requestAnimationFrame(attemptRestore);
        return;
      }

      const root = document.scrollingElement || document.documentElement;
      const delta = card.getBoundingClientRect().top - saved.top;
      if (Math.abs(delta) > 1) {
        stableFrames = 0;
        root.scrollTo({
          top: root.scrollTop + delta,
          behavior: "instant",
        });
      } else {
        stableFrames += 1;
      }

      attempts += 1;
      // A second stable frame wins over late native restoration or image layout.
      if (stableFrames >= 2 || attempts >= MAX_RESTORE_FRAMES) {
        consumeSavedPosition();
        return;
      }
      frame = requestAnimationFrame(attemptRestore);
    };

    const startRestore = () => {
      cancelAnimationFrame(frame);
      attempts = 0;
      stableFrames = 0;
      frame = requestAnimationFrame(attemptRestore);
    };

    startRestore();
    window.addEventListener("popstate", startRestore);
    window.addEventListener("pageshow", startRestore);
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("popstate", startRestore);
      window.removeEventListener("pageshow", startRestore);
    };
  }, []);
  return null;
}
