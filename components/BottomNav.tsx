"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import {
  mobileNavForMode,
  navItemForViewer,
  navItemIsActive,
} from "@/components/layout/nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();

  const { intent } = useBuyerIntent();
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const tabs = mobileNavForMode(intent?.buyerMode).map((item) =>
    navItemForViewer(item, signedOut),
  );

  const tapFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      if (!reducedMotion) navigator.vibrate?.(8);
    }
  };

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="pointer-events-none fixed bottom-0 left-0 z-50 flex w-[100dvw] max-w-[100dvw] justify-center lg:hidden"
      style={{
        height: "calc(80px + env(safe-area-inset-bottom))",
        top: "calc(100dvh - 80px - env(safe-area-inset-bottom))",
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
      }}
    >
      <div
        className="navigation-capsule pointer-events-auto grid h-16 w-[calc(100%-2.5rem)] max-w-[34rem] gap-0.5 p-1.5"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {tabs.map((item) => {
          const isActive = navItemIsActive(item, pathname);
          return (
            <Link
              key={item.name}
              href={item.href}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              aria-label={
                item.signInRequired
                  ? `${item.name} (sign in required)`
                  : item.name
              }
              onClick={tapFeedback}
              className="group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full transition-colors active:bg-[var(--s2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)]"
              style={{
                color: isActive ? "var(--accent)" : "var(--t3)",
                WebkitTapHighlightColor: "transparent",
              }}
              title={
                item.signInRequired ? `Sign in to use ${item.name}` : item.name
              }
            >
              {isActive && (
                <motion.span
                  layoutId={
                    reducedMotion ? undefined : "bottom-nav-active-pill"
                  }
                  className="absolute inset-0 rounded-full"
                  style={{ background: "var(--accent-surface)" }}
                  transition={
                    reducedMotion
                      ? { duration: 0 }
                      : { type: "spring", stiffness: 430, damping: 34 }
                  }
                  aria-hidden="true"
                />
              )}
              <motion.span
                className="relative z-10 grid h-7 w-8 place-items-center"
                tabIndex={-1}
                animate={
                  reducedMotion
                    ? undefined
                    : {
                        scale: isActive ? 1.03 : 1,
                      }
                }
                whileTap={reducedMotion ? undefined : { scale: 0.92 }}
                transition={{ type: "spring", stiffness: 520, damping: 32 }}
                aria-hidden="true"
              >
                <item.icon
                  style={{
                    width: 26,
                    height: 26,
                    strokeWidth: isActive ? 2.4 : 1.8,
                  }}
                />
              </motion.span>
              {item.signInRequired && (
                <span
                  className="absolute top-1.5 left-1/2 ml-2.5 z-10 grid h-4 w-4 place-items-center rounded-full"
                  style={{ background: "var(--s2)", color: "var(--t3)" }}
                  aria-hidden="true"
                >
                  <Lock style={{ width: 10, height: 10 }} strokeWidth={2.5} />
                </span>
              )}
              <span
                className="relative z-10"
                style={{
                  fontSize: 10.5,
                  fontWeight: isActive ? 700 : 500,
                  letterSpacing: 0,
                }}
              >
                {item.name}
                {item.signInRequired && (
                  <span className="sr-only"> (sign in required)</span>
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
