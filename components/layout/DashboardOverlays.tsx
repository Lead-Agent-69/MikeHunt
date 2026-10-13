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
 * Warm keyboard commands at idle; load buying guidance only when requested.
 */
export function DashboardOverlays() {
  const [ready, setReady] = useState(false);
  const [guideRequested, setGuideRequested] = useState(false);

  useEffect(() => {
    // Preserve requests made before the idle-loaded drawer has mounted.
    const openGuide = () => {
      setGuideRequested(true);
      setReady(true);
    };
    window.addEventListener("open-mikehunt-copilot", openGuide);
    return () => window.removeEventListener("open-mikehunt-copilot", openGuide);
  }, []);

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
      {guideRequested && <MikeHuntCopilotDrawer initialOpen={guideRequested} />}
    </>
  );
}
