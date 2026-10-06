"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { usePreferences } from "@/hooks/usePreferences";
import {
  FLIP_TOOL_ROUTES,
  flipToolAccess,
  type FlipToolRoute,
} from "@/lib/buyer/flip-tool-access";

/**
 * Route-level gate for wholesale flip tools (see FLIP_TOOL_ROUTES). Wraps the
 * page from the route's layout, so a non-flip desk never mounts the page or
 * fires its data requests.
 */
export function FlipDeskGate({
  route,
  children,
}: {
  route: FlipToolRoute;
  children: React.ReactNode;
}) {
  const { intent } = useBuyerIntent();
  const { prefs, isLoading } = usePreferences();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const access = flipToolAccess({
    mounted,
    localMode: intent?.buyerMode,
    savedMode: prefs.buyerScope?.buyerMode,
    prefsLoading: isLoading,
  });

  if (access === "allow") return <>{children}</>;
  if (access === "pending") {
    return (
      <div
        className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[var(--t4)]"
        aria-busy="true"
      >
        Loading…
      </div>
    );
  }
  return <FlipToolBlocked tool={FLIP_TOOL_ROUTES[route]} />;
}

export function FlipToolBlocked({ tool }: { tool: string }) {
  return (
    <div className="max-w-xl mx-auto px-4 py-16">
      <div
        className="glass-panel p-8 text-center"
        role="status"
        data-testid="flip-tool-blocked"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--s2)] text-[var(--t3)]">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <h1 className="text-xl font-black text-[var(--t1)] mb-2">
          This tool is for reseller and dealer desks
        </h1>
        <p className="text-sm text-[var(--t3)] mb-6">
          {tool} is built for buying to resell. If that&apos;s you, switch your
          desk in Settings. Otherwise, Discover has listings picked for what
          you&apos;re buying.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Link
            href="/discover"
            className="inline-flex rounded-[var(--r2)] bg-[var(--t1)] px-4 py-2 text-sm font-black text-[var(--s0)]"
          >
            Go to Discover
          </Link>
          <Link
            href="/settings"
            className="inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2 text-sm font-black text-[var(--t2)]"
          >
            Change desk in Settings
          </Link>
        </div>
      </div>
    </div>
  );
}
