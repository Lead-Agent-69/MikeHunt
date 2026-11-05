"use client";

import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import styles from "./MikeHuntLoader.module.css";

export type MikeHuntLoaderState = "idle" | "loading" | "complete" | "error";

function LoaderArtwork({
  size,
  hidden = false,
}: {
  size: number;
  hidden?: boolean;
}) {
  return (
    <span
      className={styles.visual}
      hidden={hidden}
      style={{ width: size }}
      aria-hidden="true"
    >
      <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden="true">
        <circle className={styles.track} cx="32" cy="32" r="27" />
        <path className={styles.ticks} d="M32 1v7M32 56v7M1 32h7M56 32h7" />
        <circle
          className={styles.arc}
          data-motion="scan"
          cx="32"
          cy="32"
          r="27"
        />
        <path
          className={styles.scanLine}
          data-motion="discover"
          d="M12 32h40"
        />
        <path
          className={styles.brackets}
          data-motion="evaluate"
          d="M16 24v-8h8M40 16h8v8M48 40v8h-8M24 48h-8v-8"
        />
      </svg>
      <span className={styles.revealAccent} data-motion="reveal" />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.final}
        src="/brand/DEALERHUNT-D.svg"
        alt=""
        aria-hidden="true"
      />
    </span>
  );
}

// Mounted only for a continuous pending interval. These timers control artwork,
// never request execution, accessible task text, or result delivery.
function PendingArtwork({ size }: { size: number }) {
  const [stage, setStage] = useState<"hidden" | "compact" | "full">("hidden");
  useEffect(() => {
    const show = window.setTimeout(() => setStage("compact"), 200);
    const expand = window.setTimeout(() => setStage("full"), 1000);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(expand);
    };
  }, []);
  return (
    <LoaderArtwork
      hidden={stage === "hidden"}
      size={stage === "full" ? size : Math.min(size, 32)}
    />
  );
}

export function MikeHuntLoader({
  state,
  size = 64,
  label = "Loading",
  className,
  motion = "animated",
}: {
  state: MikeHuntLoaderState;
  size?: number;
  label?: string;
  className?: string;
  motion?: "animated" | "static";
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
      style={{ width: size, height: size }}
      data-state={state}
      data-motion={motion}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {state === "loading" ? (
        <PendingArtwork size={size} />
      ) : (
        <LoaderArtwork size={size} />
      )}
      <span className="sr-only">{announcement}</span>
    </div>
  );
}
