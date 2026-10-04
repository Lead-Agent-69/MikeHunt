"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const CommandPalette = dynamic(
  () =>
    import("@/components/shared/CommandPalette").then(
      (module) => module.CommandPalette,
    ),
  { ssr: false },
);

const MikeHuntCopilotDrawer = dynamic(
  () =>
    import("@/components/ui/next-level-features").then(
      (module) => module.MikeHuntCopilotDrawer,
    ),
  { ssr: false },
);

/**
 * Command and assistant tools are useful after the workspace is interactive, but should not
 * compete with the first render of every dashboard route. Load them at idle instead.
 */
export function DashboardOverlays() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(() => setReady(true), {
        timeout: 1500,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timeoutId = window.setTimeout(() => setReady(true), 600);
    return () => window.clearTimeout(timeoutId);
  }, []);

  if (!ready) return null;
  return (
    <>
      <CommandPalette />
      <MikeHuntCopilotDrawer />
    </>
  );
}
