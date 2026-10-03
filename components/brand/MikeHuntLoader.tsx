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
      {/* Repeated asset layers are decorative; the status text carries the task state. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cn(styles.piece, styles.left)}
        src="/brand/MIKEHUNT-M.svg"
        alt=""
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cn(styles.piece, styles.middle)}
        src="/brand/MIKEHUNT-M.svg"
        alt=""
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={cn(styles.piece, styles.right)}
        src="/brand/MIKEHUNT-M.svg"
        alt=""
        aria-hidden="true"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.final}
        src="/brand/MIKEHUNT-M.svg"
        alt=""
        aria-hidden="true"
      />
      <span className="sr-only">{announcement}</span>
    </div>
  );
}
