"use client";

import { useEffect, useState } from "react";

// Recently-viewed deals/leads — a modern-app staple that was missing. localStorage-only (no backend),
// shared across cars + homes, so a user can jump straight back to what they were just looking at. Record
// from the detail pages; render the strip on the feeds.

export interface RecentItem {
  id: string;
  kind: "car" | "home";
  title: string;
  sub?: string;
  image?: string;
  href: string;
}

const KEY = "recently-viewed-v1";
const CAP = 15;
const EVENT = "recently-viewed-change";

function read(): RecentItem[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** Record a viewed item (most-recent first, de-duped, capped). Safe to call on every detail-page mount. */
export function recordRecent(item: RecentItem) {
  if (typeof window === "undefined" || !item?.id) return;
  const list = read().filter(
    (r) => !(r.id === item.id && r.kind === item.kind),
  );
  list.unshift(item);
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, CAP)));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* quota / privacy mode — non-fatal */
  }
}

/** The recent items for a vertical (or all). Live-updates when a new item is recorded. */
export function useRecentlyViewed(kind?: "car" | "home"): RecentItem[] {
  const [items, setItems] = useState<RecentItem[]>([]);
  useEffect(() => {
    const load = () => {
      const all = read();
      setItems(kind ? all.filter((r) => r.kind === kind) : all);
    };
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load); // sync across tabs
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [kind]);
  return items;
}
