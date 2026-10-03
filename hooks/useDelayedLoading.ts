"use client";

import { useEffect, useState } from "react";

/** Avoid a distracting flash for work that resolves before people can perceive it. */
export function useDelayedLoading(active: boolean, delay = 220) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timeout = window.setTimeout(() => setVisible(true), delay);
    return () => window.clearTimeout(timeout);
  }, [active, delay]);
  return visible;
}
