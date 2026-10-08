"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Lock } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { useLocalSavedVehicles } from "@/hooks/useLocalSavedVehicles";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import {
  mobileNavForMode,
  navItemForViewer,
  navItemIsActive,
} from "@/components/layout/nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const reducedMotion = useReducedMotion();
  const localSaved = useLocalSavedVehicles();
  const { intent } = useBuyerIntent();
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const tabs = mobileNavForMode(intent?.buyerMode).map((item) =>
    navItemForViewer(item, signedOut),
  );
  const watchScopeCount = localSaved.count;

  const tapFeedback = () => {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      if (!reducedMotion) navigator.vibrate?.(8);
    }
  };

  return (
    <nav
      aria-label="Primary mobile navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5"
      style={{
        background: "var(--glass)",
        backdropFilter: "blur(18px) saturate(180%)",
        WebkitBackdropFilter: "blur(18px) saturate(180%)",
        borderTop: "1px solid var(--b1)",
        boxShadow: "0 -4px 20px rgba(60,30,60,.07)",
        height: "calc(58px + env(safe-area-inset-bottom))",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {tabs.map((item) => {
        const isActive = navItemIsActive(item, pathname);
        return (
          <Link
            key={item.name}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            onClick={tapFeedback}
            className="group relative flex flex-col items-center justify-center gap-1 overflow-hidden transition-colors"
            style={{
              color: isActive ? "var(--accent)" : "var(--t4)",
              WebkitTapHighlightColor: "transparent",
            }}
            title={
              item.signInRequired
                ? `Sign in to use ${item.name}`
                : item.name === "Saved" && watchScopeCount
                  ? `${watchScopeCount} vehicle${
                      watchScopeCount === 1 ? "" : "s"
                    } saved on this device`
                  : item.name
            }
          >
            {isActive && (
              <motion.span
                layoutId={reducedMotion ? undefined : "bottom-nav-active-pill"}
                className="absolute inset-x-3 top-1.5 bottom-1.5 rounded-[22px]"
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
              className="relative z-10 grid h-6 w-8 place-items-center"
              animate={
                reducedMotion
                  ? undefined
                  : {
                      y: isActive ? -1 : 0,
                      scale: isActive ? 1.08 : 1,
                    }
              }
              whileTap={reducedMotion ? undefined : { scale: 0.92 }}
              transition={{ type: "spring", stiffness: 520, damping: 32 }}
              aria-hidden="true"
            >
              <item.icon
                style={{
                  width: 22,
                  height: 22,
                  strokeWidth: isActive ? 2.5 : 1.8,
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
            {!item.signInRequired &&
              item.name === "Saved" &&
              watchScopeCount > 0 && (
                <span
                  className="absolute top-1.5 left-1/2 ml-2.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[9px] font-black text-white"
                  style={{ background: "var(--accent)", lineHeight: 1 }}
                >
                  {watchScopeCount > 99 ? "99+" : watchScopeCount}
                </span>
              )}
            <span
              className="relative z-10"
              style={{
                fontSize: 10.5,
                fontWeight: isActive ? 760 : 620,
                letterSpacing: "0.01em",
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
    </nav>
  );
}
