"use client";

import { cn } from "@/lib/utils";
import styles from "./MikeHuntLoader.module.css";

export type MikeHuntLoaderState = "idle" | "loading" | "complete" | "error";

export function MikeHuntLoader({
  state,
  size = 64,
  label = "Loading",
  className,
}: {
  state: MikeHuntLoaderState;
  size?: number;
  label?: string;
  className?: string;
}) {
  const announcement =
    state === "loading"
      ? label
      : state === "complete"
        ? `${label} complete`
        : state === "error"
          ? `${label} failed`
          : label;
  return (
    <div
      className={cn(styles.loader, className)}
      data-state={state}
      style={{ width: size }}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.track} cx="32" cy="32" r="29" />
        <circle className={styles.arc} cx="32" cy="32" r="29" />
      </svg>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.final}
        src="/brand/DEALERHUNT-D.svg"
        alt=""
        aria-hidden="true"
      />
      <span className="sr-only">{announcement}</span>
    </div>
  );
}
