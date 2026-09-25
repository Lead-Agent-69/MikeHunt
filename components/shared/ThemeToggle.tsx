"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Sun, Moon, Monitor, type LucideIcon } from "lucide-react";

export type Theme = "light" | "dark" | "system";

function prefersDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && prefersDark());
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Read/persist the theme preference and keep <html data-theme> in sync (incl. OS changes). */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Theme) || "system";
    setThemeState(saved);
    applyTheme(saved);
  }, []);

  // When on "system", follow OS theme changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem("theme", t);
    } catch {
      /* ignore */
    }
    applyTheme(t);
  }, []);

  return { theme, setTheme };
}

const ORDER: Theme[] = ["system", "light", "dark"];
const ICON: Record<Theme, LucideIcon> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};
const LABEL: Record<Theme, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/** Cycles System → Light → Dark. Compact icon button styled for the nav. */
export function ThemeToggle({ showLabel = false }: { showLabel?: boolean }) {
  const { theme, setTheme } = useTheme();
  const Icon = ICON[theme];
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];

  return (
    <button
      onClick={() => setTheme(next)}
      title={`Theme: ${LABEL[theme]} (tap for ${LABEL[next]})`}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next]}.`}
      className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--r2)] text-[var(--t3)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors"
    >
      <Icon size={16} />
      {showLabel && <span className="text-sm font-medium">{LABEL[theme]}</span>}
    </button>
  );
}
