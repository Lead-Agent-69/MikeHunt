"use client";

import { useEffect } from "react";

const KEY = "marketReturnPosition";

export function rememberMarketPosition(card: HTMLElement | null) {
  if (!card?.dataset.marketVehicle) return;
  window.history.replaceState(
    {
      ...window.history.state,
      [KEY]: {
        url: window.location.pathname + window.location.search,
        id: card.dataset.marketVehicle,
        top: card.getBoundingClientRect().top,
      },
    },
    "",
  );
}

// Native restoration can run while asynchronous results still have zero height.
export function MarketReturnPosition() {
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        const saved = window.history.state?.[KEY];
        if (
          !saved ||
          saved.url !== window.location.pathname + window.location.search ||
          typeof saved.id !== "string" ||
          !Number.isFinite(saved.top)
        )
          return;
        const card = Array.from(
          document.querySelectorAll<HTMLElement>("[data-market-vehicle]"),
        ).find((element) => element.dataset.marketVehicle === saved.id);
        if (!card) return;
        const state = { ...window.history.state };
        delete state[KEY];
        window.history.replaceState(state, "");
        const root = document.scrollingElement || document.documentElement;
        root.scrollTo({
          top: root.scrollTop + card.getBoundingClientRect().top - saved.top,
          behavior: "instant",
        });
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  return null;
}
