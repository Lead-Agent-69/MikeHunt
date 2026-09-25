"use client";

import { useEffect, useState } from "react";

// Compare set — pick a few leads/deals and view them side-by-side. localStorage-backed (no auth), scoped
// by vertical, capped at 4. Mirrors the recently-viewed pattern.

export interface CompareItem {
  id: string;
  kind: "car" | "home";
}

const KEY = "compare-set-v1";
const CAP = 4;
const EVENT = "compare-change";

function read(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function write(list: CompareItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENT));
  } catch {
    /* non-fatal */
  }
}

/** Add/remove an item. Caps per-vertical at CAP (drops the oldest of that vertical). */
export function toggleCompare(item: CompareItem) {
  if (typeof window === "undefined" || !item?.id) return;
  const list = read();
  const idx = list.findIndex((r) => r.id === item.id && r.kind === item.kind);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(item);
    const sameKind = list.filter((r) => r.kind === item.kind);
    if (sameKind.length > CAP) {
      const drop = sameKind[0];
      const di = list.findIndex(
        (r) => r.id === drop.id && r.kind === drop.kind,
      );
      if (di >= 0) list.splice(di, 1);
    }
  }
  write(list);
}

export function clearCompare(kind?: "car" | "home") {
  write(kind ? read().filter((r) => r.kind !== kind) : []);
}

/** Live compare set for a vertical, plus helpers. */
export function useCompare(kind: "car" | "home") {
  const [items, setItems] = useState<CompareItem[]>([]);
  useEffect(() => {
    const load = () => setItems(read().filter((r) => r.kind === kind));
    load();
    window.addEventListener(EVENT, load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener(EVENT, load);
      window.removeEventListener("storage", load);
    };
  }, [kind]);
  return {
    items,
    ids: items.map((i) => i.id),
    has: (id: string) => items.some((i) => i.id === id),
    toggle: (id: string) => toggleCompare({ id, kind }),
    clear: () => clearCompare(kind),
    cap: CAP,
  };
}
