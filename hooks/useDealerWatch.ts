"use client";

import { useEffect, useState } from "react";

// Watchlist of favorited dealers (by host) — localStorage, no auth, so a user can follow the
// salvage/rebuilder shops they trust and jump to their inventory. Mirrors useCompare/useRecentlyViewed.

const KEY = "dealer-watch-v1";
const EVENT = "dealer-watch-change";

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function useDealerWatch() {
  const [hosts, setHosts] = useState<string[]>([]);
  useEffect(() => {
    const load = () => setHosts(read());
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, []);

  const toggle = (host: string) => {
    if (!host) return;
    const list = read();
    const i = list.indexOf(host);
    if (i >= 0) list.splice(i, 1);
    else list.push(host);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      window.dispatchEvent(new Event(EVENT));
    } catch {
      /* quota / privacy mode — non-fatal */
    }
  };

  return {
    hosts,
    has: (h: string) => hosts.includes(h),
    toggle,
    count: hosts.length,
  };
}
