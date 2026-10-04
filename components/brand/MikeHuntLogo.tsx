"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { THEME_EVENT } from "@/components/shared/ThemeToggle";

type LogoSize = "sm" | "md" | "lg";

const MARK_SIZES: Record<LogoSize, string> = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-14 w-14",
};

const WORDMARK_SIZES: Record<LogoSize, string> = {
  sm: "text-[17px]",
  md: "text-xl",
  lg: "text-2xl",
};

function useAppliedTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const read = () => {
      setTheme(
        document.documentElement.getAttribute("data-theme") === "dark"
          ? "dark"
          : "light",
      );
    };
    read();
    window.addEventListener(THEME_EVENT, read);
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      window.removeEventListener(THEME_EVENT, read);
      obs.disconnect();
    };
  }, []);

  return theme;
}

export function MikeHuntMark({
  size = "sm",
  className,
}: {
  size?: LogoSize;
  className?: string;
  tile?: boolean;
}) {
  const surface = useAppliedTheme();
  return (
    <span
      className={cn(
        MARK_SIZES[size],
        "inline-flex shrink-0 items-center justify-center",
        surface === "dark" &&
          "rounded-[5px] bg-white p-[3px] shadow-[0_0_0_1px_rgba(15,23,42,0.12)]",
        className,
      )}
    >
      {/* The supplied M is embedded raster artwork; do not recreate it in CSS or paths. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/MIKEHUNT-M.svg"
        alt=""
        aria-hidden="true"
        className="h-full w-full object-contain"
      />
    </span>
  );
}

export function MikeHuntLogo({
  size = "sm",
  className,
  wordmarkClassName,
  showWordmark = true,
}: {
  size?: LogoSize;
  className?: string;
  wordmarkClassName?: string;
  showWordmark?: boolean;
  tile?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <MikeHuntMark size={size} />
      {showWordmark && (
        <span
          className={cn(
            "font-black uppercase leading-none tracking-tight text-[var(--t1)]",
            WORDMARK_SIZES[size],
            wordmarkClassName,
          )}
        >
          MIKEHUNT
        </span>
      )}
    </span>
  );
}