"use client";

import Link from "next/link";
import { useCompare } from "@/hooks/useCompare";

// Self-contained so it subscribes to the compare set WITHOUT re-rendering the (memoized) card body it
// sits in — only the toggle + the bar update when the set changes.

export function CompareToggle({
  id,
  kind,
  accent = "var(--home)",
}: {
  id: string;
  kind: "car" | "home";
  accent?: string;
}) {
  const { has, toggle, items, cap } = useCompare(kind);
  const on = has(id);
  const full = !on && items.length >= cap;
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!full) toggle(id);
      }}
      title={
        full ? `Compare full (${cap})` : on ? "Remove from compare" : "Compare"
      }
      aria-pressed={on}
      className="h-7 w-7 grid place-items-center rounded-full text-[13px] font-black shadow-[var(--shadow2)] transition-colors disabled:opacity-40"
      style={{
        background: on ? accent : "var(--s2)",
        color: on ? "#000" : "var(--t2)",
        border: `1px solid ${on ? accent : "var(--b3)"}`,
      }}
      disabled={full}
    >
      ⚖
    </button>
  );
}

export function CompareBar({
  kind,
  href,
  accent = "var(--home)",
}: {
  kind: "car" | "home";
  href: string;
  accent?: string;
}) {
  const { items, clear } = useCompare(kind);
  if (items.length < 2) return null;
  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full pl-4 pr-2 py-2 shadow-[var(--shadow3)] bg-[var(--s0)] border border-[var(--b1)]">
      <span className="text-xs font-bold text-[var(--t2)]">
        {items.length} to compare
      </span>
      <Link
        href={href}
        className="text-xs font-black px-3 py-1.5 rounded-full text-black"
        style={{ background: accent }}
      >
        Compare →
      </Link>
      <button
        onClick={() => clear()}
        aria-label="Clear compare"
        className="h-6 w-6 grid place-items-center rounded-full text-[var(--t4)] hover:text-[var(--red)]"
      >
        ✕
      </button>
    </div>
  );
}
