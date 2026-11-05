"use client";

import { useEffect, useRef, useState } from "react";
import { MikeHuntLoader } from "./MikeHuntLoader";
import styles from "./BrandStartupLoader.module.css";

const SESSION_KEY = "dealerhunt:dashboard-route-startup:v1";
// Also covers blocked storage and concurrent/repeated fallback mounts in this document.
let claimedInDocument = false;

function claimFirstRouteFallback() {
  if (claimedInDocument) return false;
  claimedInDocument = true;
  try {
    const seen = window.sessionStorage.getItem(SESSION_KEY) === "1";
    if (seen) return false;
    window.sessionStorage.setItem(SESSION_KEY, "1");
    return true;
  } catch {
    // Without session storage, repeat protection lasts for this JS document only.
    return true;
  }
}

/** Only mount as genuine route Suspense feedback; never gate usable children. */
export function BrandStartupLoader({
  motion = "auto",
}: {
  motion?: "auto" | "static";
}) {
  const [animated, setAnimated] = useState(false);
  const attempt = useRef<{ first: boolean; deadline: number } | null>(null);

  useEffect(() => {
    // Keep a single claim/deadline through Strict Mode's effect replay.
    attempt.current ??= {
      first: claimFirstRouteFallback(),
      deadline: performance.now() + 1300,
    };
    if (!attempt.current.first) return;
    const remaining = Math.max(0, attempt.current.deadline - performance.now());
    setAnimated(remaining > 0);
    if (!remaining) return;
    const cap = window.setTimeout(() => setAnimated(false), remaining);
    return () => window.clearTimeout(cap);
  }, []);

  return (
    <div className={styles.startup}>
      <div className={styles.artworkSlot}>
        <MikeHuntLoader
          state="loading"
          size={64}
          label="Loading workspace"
          motion={animated && motion !== "static" ? "animated" : "static"}
        />
      </div>
      <p className={styles.label} aria-hidden="true">
        Loading workspace
      </p>
    </div>
  );
}
