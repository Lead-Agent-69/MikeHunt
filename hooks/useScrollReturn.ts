"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Radix body scroll locks must not discard this dashboard's body-based scroll position. */
export function useScrollReturn(resultsId?: string) {
  const [restoring, setRestoring] = useState(false);
  const snapshot = useRef<{
    path: string;
    search: string;
    windowY: number;
    bodyY: number;
    htmlY: number;
  } | null>(null);
  const frames = useRef<number[]>([]);
  const cancel = useCallback(() => {
    frames.current.forEach(cancelAnimationFrame);
    frames.current = [];
  }, []);
  useEffect(() => cancel, [cancel]);
  return {
    restoring,
    capture() {
      cancel();
      setRestoring(false);
      snapshot.current = {
        path: window.location.pathname,
        search: window.location.search,
        windowY: window.scrollY,
        bodyY: document.body.scrollTop,
        htmlY: document.documentElement.scrollTop,
      };
    },
    restore(showResults = false) {
      cancel();
      const saved = snapshot.current;
      snapshot.current = null;
      if (!saved) return;
      setRestoring(true);
      const apply = () => {
        if (window.location.pathname !== saved.path) return;
        if (
          resultsId &&
          (showResults || window.location.search !== saved.search)
        ) {
          document
            .getElementById(resultsId)
            ?.scrollIntoView({ block: "start", behavior: "instant" });
          return;
        }
        window.scrollTo({ top: saved.windowY, behavior: "instant" });
        document.documentElement.scrollTop = saved.htmlY;
        document.body.scrollTop = saved.bodyY;
      };
      // Restore after React removes the modal's body lock, then after browser focus settles.
      frames.current.push(
        requestAnimationFrame(() => {
          apply();
          frames.current.push(
            requestAnimationFrame(() => {
              apply();
              setRestoring(false);
              frames.current = [];
            }),
          );
        }),
      );
    },
  };
}
