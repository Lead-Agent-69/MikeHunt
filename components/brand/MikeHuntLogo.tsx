"use client";

import { cn } from "@/lib/utils";
import styles from "./MikeHuntLogo.module.css";

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

export function MikeHuntMark({
  size = "sm",
  className,
}: {
  size?: LogoSize;
  className?: string;
  tile?: boolean;
}) {
  return (
    <span
      className={cn(
        MARK_SIZES[size],
        "inline-flex shrink-0 items-center justify-center",
        styles.mark,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/DEALERHUNT-D.svg"
        alt=""
        aria-hidden="true"
        width={56}
        height={56}
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
            "font-black uppercase leading-none tracking-normal text-[var(--t1)] whitespace-nowrap",
            WORDMARK_SIZES[size],
            wordmarkClassName,
          )}
        >
          <span>DEALER</span>
          <span className={styles.hunt}>HUNT</span>
        </span>
      )}
    </span>
  );
}
