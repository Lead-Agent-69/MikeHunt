"use client";

// Back-from-a-deal scroll restore for long lists (/feed, /saved, /scan).
//
// Each list saves {scrollY, pagination state} to sessionStorage under a key that includes its
// query, while you scroll and just before you follow a link. When you come BACK (browser back /
// forward, or a client-side popstate), the page re-hydrates its loaded pages from that entry and
// we scroll once the document is tall enough to reach the saved position. A fresh visit (tab
// click, typed URL) starts at the top as before.
//
// Composes with a virtualized list: the stored state is the page data, not DOM; once the data is
// back the virtualizer's total height covers scrollY and the same scrollTo lands the same rows.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PREFIX = "mh:list-restore:";
const MAX_AGE_MS = 30 * 60 * 1000;
const POP_WINDOW_MS = 5000;

export interface ListRestoreEntry<S> {
  y: number;
  state: S;
  at: number;
}

let lastPopAt = 0;
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    lastPopAt = Date.now();
  });
}

/** True when this render is the result of Back/Forward (client popstate or a bfcache-less reload of history). */
export function isBackForwardNavigation(now = Date.now()): boolean {
  if (typeof window === "undefined") return false;
  if (now - lastPopAt < POP_WINDOW_MS) return true;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    // A hard Back into the app: only trust it during the first seconds of the document.
    return nav?.type === "back_forward" && performance.now() < POP_WINDOW_MS;
  } catch {
    return false;
  }
}

/** Test hook: mark that a popstate just happened. */
export function markPopState(at = Date.now()) {
  lastPopAt = at;
}

export function readListRestore<S>(key: string): ListRestoreEntry<S> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ListRestoreEntry<S>;
    if (
      !entry ||
      typeof entry.y !== "number" ||
      Date.now() - entry.at > MAX_AGE_MS
    )
      return null;
    return entry;
  } catch {
    return null;
  }
}

export function writeListRestore<S>(key: string, y: number, state: S) {
  try {
    window.sessionStorage.setItem(
      PREFIX + key,
      JSON.stringify({ y: Math.max(0, Math.round(y)), state, at: Date.now() }),
    );
  } catch {
    // Quota or private mode: restore is best-effort; drop the state but keep the position.
    try {
      window.sessionStorage.setItem(
        PREFIX + key,
        JSON.stringify({ y: Math.round(y), state: null, at: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }
}

export function clearListRestore(key: string) {
  try {
    window.sessionStorage.removeItem(PREFIX + key);
  } catch {
    /* ignore */
  }
}

/**
 * The entry to re-hydrate from, only when arriving via Back/Forward. Read it once per key
 * (call during the page's reset effect) and hydrate pagination state from `entry.state`.
 */
export function takeBackNavigationEntry<S>(
  key: string | null,
): ListRestoreEntry<S> | null {
  if (!key || !isBackForwardNavigation()) return null;
  return readListRestore<S>(key);
}

/**
 * Per-mount Back restore. Whether this mount came from Back/Forward is decided ONCE, at mount, so a
 * key that settles late (saved prefs, source health) still restores; each key restores at most once
 * per mount. `recentlyRestored(key)` lets a page skip a reset that its own late-settling inputs
 * trigger right after it re-hydrated.
 */
export function useBackNavigationEntry() {
  const [arrived] = useState(() => isBackForwardNavigation());
  const taken = useRef(new Map<string, number>());
  const take = useCallback(
    <S>(key: string | null): ListRestoreEntry<S> | null => {
      if (!key || !arrived || taken.current.has(key)) return null;
      const entry = readListRestore<S>(key);
      if (entry) taken.current.set(key, Date.now());
      return entry;
    },
    [arrived],
  );
  const recentlyRestored = useCallback(
    (key: string | null, withinMs = 10000) => {
      const at = key ? taken.current.get(key) : undefined;
      return at != null && Date.now() - at < withinMs;
    },
    [],
  );
  // Stable identity: pages list this in effect deps.
  return useMemo(() => ({ take, recentlyRestored }), [take, recentlyRestored]);
}

/**
 * Scroll to y once the document can reach it (data re-rendered), then hold it there while late
 * layout (images, fonts, measured rows) settles. Stops on the first wheel / touch / key from the
 * user, once y has held on a stable page for ~20 frames, or after timeoutMs (then it lands as close as it can).
 * Returns a cancel function.
 */
export function scrollWhenReachable(y: number, timeoutMs = 6000): () => void {
  let raf = 0;
  let cancelled = false;
  let held = 0;
  let lastHeight = -1;
  const started = performance.now();
  const stop = () => {
    cancelled = true;
  };
  const opts = { passive: true, once: true } as const;
  window.addEventListener("wheel", stop, opts);
  window.addEventListener("touchstart", stop, opts);
  window.addEventListener("keydown", stop, opts);
  const go = () =>
    window.scrollTo({ top: y, behavior: "instant" as ScrollBehavior });
  const tick = () => {
    if (cancelled) return;
    const height = document.documentElement.scrollHeight;
    const reachable = height - window.innerHeight >= y - 1;
    // Rows/images still settling above the target shift it; only count frames with a stable page.
    if (height !== lastHeight) held = 0;
    lastHeight = height;
    if (reachable) {
      if (Math.abs(window.scrollY - y) > 2) {
        go();
        held = 0;
      } else if (++held >= 20) return;
    }
    if (performance.now() - started > timeoutMs) {
      if (!reachable) go();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    cancelled = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("wheel", stop);
    window.removeEventListener("touchstart", stop);
    window.removeEventListener("keydown", stop);
  };
}

/**
 * Keep the entry for `key` current: scroll position (throttled) plus `getState()`, and a final
 * write when a link is followed or the page is hidden.
 */
export function useSaveListPosition<S>(key: string | null, getState: () => S) {
  const getRef = useRef(getState);
  useEffect(() => {
    getRef.current = getState;
  });
  // Arriving via Back, the page starts at y=0 until it re-hydrates; scroll events from that phase
  // must not overwrite the entry we are about to restore. User actions (link click, pagehide)
  // always save.
  const suspendedUntil = useRef(0);
  useEffect(() => {
    if (isBackForwardNavigation()) suspendedUntil.current = Date.now() + 6000;
  }, []);
  const save = useCallback(() => {
    if (key) writeListRestore(key, window.scrollY, getRef.current());
  }, [key]);
  const saveFromScroll = useCallback(() => {
    if (Date.now() >= suspendedUntil.current) save();
  }, [save]);
  useEffect(() => {
    if (!key) return;
    let t: ReturnType<typeof setTimeout> | null = null;
    const onScroll = () => {
      if (t) return;
      t = setTimeout(() => {
        t = null;
        saveFromScroll();
      }, 200);
    };
    // Capture phase: runs before Next's <Link> navigates away.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (a) save();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    window.addEventListener("pagehide", save);
    return () => {
      if (t) clearTimeout(t);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("pagehide", save);
    };
  }, [key, save, saveFromScroll]);
  return save;
}
