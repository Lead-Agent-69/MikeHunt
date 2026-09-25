"use client";

import { useEffect, useState } from "react";

/**
 * Count a number up from 0 to `target` with an ease-out-cubic curve (rAF-driven). The signature animation
 * on both heroes — cars (DiscoverHero) and housing (HomeIQ). Resets to 0 when target is falsy so a live
 * stat that arrives after fetch animates in. Extracted from DiscoverHero so both verticals share one impl.
 */
export function useCountUp(target: number, ms = 1000): number {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!target) {
      setV(0);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (now: number) => {
      if (!start) start = now;
      const p = Math.min(1, (now - start) / ms);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3)))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}
