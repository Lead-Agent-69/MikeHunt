"use client";

import { useEffect, useState } from "react";
import { preload } from "swr";
import Link from "next/link";
import { Lock } from "lucide-react";
import { PurchasePipeline } from "@/components/saved/PurchasePipeline";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { usePreferences } from "@/hooks/usePreferences";
import {
  FLIP_TOOL_ROUTES,
  flipToolAccess,
  type FlipToolRoute,
} from "@/lib/buyer/flip-tool-access";
import {
  PURCHASE_CHECKLIST_KEY,
  fetchPurchaseChecklist,
} from "@/lib/saved/purchase-checklist";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";

/**
 * Route-level gate for wholesale flip tools (see FLIP_TOOL_ROUTES). Wraps the
 * page from the route's layout, so a non-flip desk never mounts the page or
 * fires its data requests.
 *
 * `openToAllDesks` is the part of the route every desk may use (e.g. Check any
 * listing on /find). A non-flip desk sees it above the "for reseller and dealer
 * desks" notice; only the flip tools themselves stay gated.
 */
export function FlipDeskGate({
  route,
  children,
  openToAllDesks,
}: {
  route: FlipToolRoute;
  children: React.ReactNode;
  openToAllDesks?: React.ReactNode;
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

  // /fleet for a non-flip desk renders the Purchase plan checklist. Start its fetch NOW, in
  // parallel with /api/preferences, instead of waiting for prefs to mount the checklist first.
  const preloadChecklist =
    route === "/fleet" &&
    access !== "allow" &&
    !isFlipBuyerMode(intent?.buyerMode);
  useEffect(() => {
    if (preloadChecklist)
      preload(PURCHASE_CHECKLIST_KEY, fetchPurchaseChecklist);
  }, [preloadChecklist]);

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
  if (route === "/fleet") return <PurchasePipeline />;
  if (openToAllDesks) {
    return (
      <div
        className="max-w-3xl mx-auto space-y-4 px-4 py-6 pb-24 md:pb-6"
        data-testid="flip-open-to-all"
      >
        <h1 className="sr-only">{FLIP_TOOL_ROUTES[route]}</h1>
        {openToAllDesks}
        <FlipToolBlocked tool={FLIP_TOOL_ROUTES[route]} headingLevel={2} />
      </div>
    );
  }
  return <FlipToolBlocked tool={FLIP_TOOL_ROUTES[route]} />;
}

export function FlipToolBlocked({
  tool,
  headingLevel = 1,
}: {
  tool: string;
  /** 2 when the notice sits under other content that already has the page h1. */
  headingLevel?: 1 | 2;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h1";
  return (
    <div
      className={
        headingLevel === 2 ? "max-w-xl mx-auto" : "max-w-xl mx-auto px-4 py-16"
      }
    >
      <div
        className="glass-panel p-8 text-center"
        role="status"
        data-testid="flip-tool-blocked"
      >
        <div className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-[var(--s2)] text-[var(--t3)]">
          <Lock className="h-5 w-5" aria-hidden />
        </div>
        <Heading className="text-xl font-black text-[var(--t1)] mb-2">
          This tool is for reseller and dealer desks
        </Heading>
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
