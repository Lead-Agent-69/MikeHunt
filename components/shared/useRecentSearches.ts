"use client";

import { useCallback, useEffect, useState } from "react";

const KEY = "dhp_recent_searches";
const MAX = 8;

/** Persisted recent search queries (most-recent-first, de-duped, capped). Visor-style. */
export function useRecentSearches() {
  const [recents, setRecents] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setRecents(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback((next: string[]) => {
    setRecents(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }, []);

  const addRecent = useCallback((raw: string) => {
    const q = raw.trim();
    if (q.length < 2) return;
    setRecents((prev) => {
      const next = [
        q,
        ...prev.filter((r) => r.toLowerCase() !== q.toLowerCase()),
      ].slice(0, MAX);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const removeRecent = useCallback(
    (q: string) => persist(recents.filter((r) => r !== q)),
    [recents, persist],
  );

  const clearRecents = useCallback(() => persist([]), [persist]);

  return { recents, addRecent, removeRecent, clearRecents };
}
