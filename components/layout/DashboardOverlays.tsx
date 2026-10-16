"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { CommandPalette } from "@/components/shared/CommandPalette";

const MikeHuntCopilotDrawer = dynamic(
  () =>
    import("@/components/ui/next-level-features").then(
      (module) => module.MikeHuntCopilotDrawer,
    ),
  { ssr: false },
);

/**
 * Keep the small global keyboard listener ready; load guidance only on request.
 */
export function DashboardOverlays() {
  const [guideRequested, setGuideRequested] = useState(false);

  useEffect(() => {
    // Preserve requests made before the idle-loaded drawer has mounted.
    const openGuide = () => {
      setGuideRequested(true);
    };
    window.addEventListener("open-mikehunt-copilot", openGuide);
    return () => window.removeEventListener("open-mikehunt-copilot", openGuide);
  }, []);

  return (
    <>
      <CommandPalette />
      {guideRequested && <MikeHuntCopilotDrawer initialOpen={guideRequested} />}
    </>
  );
}
