"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  motion,
  useReducedMotion,
  useMotionValueEvent,
  useSpring,
  useTransform,
  useVelocity,
} from "framer-motion";
import { Lock } from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useNavigationScrub } from "@/hooks/useNavigationScrub";
import {
  mobileNavForMode,
  navItemForViewer,
  navItemIsActive,
} from "@/components/layout/nav-items";

export function BottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const { intent } = useBuyerIntent();
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const tabs = mobileNavForMode(intent?.buyerMode).map((item) =>
    navItemForViewer(item, signedOut),
  );
  const selected = tabs.findIndex((item) => navItemIsActive(item, pathname));
  const scrub = useNavigationScrub(selected, tabs.length, pathname, (index) => {
    tapFeedback();
    router.push(tabs[index].href);
  });
  const settledPosition = useSpring(scrub.position, {
    stiffness: 520,
    damping: 36,
  });
  useMotionValueEvent(scrub.dragging, "change", (isDragging) => {
    if (!isDragging) settledPosition.jump(scrub.position.get());
  });
  const pillX = useTransform(() => {
    const direct = scrub.position.get();
    const settled = settledPosition.get();
    const dragging = scrub.dragging.get();
    const value = reducedMotion || dragging ? direct : settled;
    return `calc(${value * 100}% * var(--nav-direction, 1))`;
  });
  const dragVelocity = useVelocity(scrub.position);
  const pillStretch = useSpring(
    useTransform(() =>
      reducedMotion || !scrub.dragging.get()
        ? 1
        : 1 + Math.min(Math.abs(dragVelocity.get()) * 0.012, 0.14),
    ),
    { stiffness: 360, damping: 28 },
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
        {...scrub.handlers}
        data-navigation-scrub=""
        data-pressed={scrub.pressed || undefined}
        className="navigation-capsule navigation-mobile-capsule pointer-events-auto relative isolate grid h-16 w-[calc(100%-3.5rem)] max-w-[21rem] p-1 sm:h-14"
        style={{
          gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))`,
        }}
      >
        {(selected >= 0 || scrub.preview !== null) && (
          <motion.span
            className="navigation-selection pointer-events-none absolute bottom-1 start-1 top-1 rounded-full rtl:[--nav-direction:-1]"
            style={{
              width: `calc((100% - 8px) / ${tabs.length})`,
              x: pillX,
              scaleX: reducedMotion ? 1 : pillStretch,
            }}
            animate={
              reducedMotion
                ? undefined
                : {
                    scaleY: scrub.pressed ? 0.96 : 1,
                  }
            }
            transition={{ type: "spring", stiffness: 520, damping: 36 }}
            aria-hidden="true"
          >
            <span className="navigation-paint" />
          </motion.span>
        )}
        {tabs.map((item, index) => {
          const isActive = navItemIsActive(item, pathname);
          const highlighted = index === (scrub.preview ?? selected);
          return (
            <Link
              key={item.name}
              href={item.href}
              draggable={false}
              prefetch={false}
              aria-current={isActive ? "page" : undefined}
              data-highlighted={highlighted || undefined}
              aria-label={
                item.signInRequired
                  ? `${item.name} (sign in required)`
                  : item.name
              }
              onNavigate={() => {
                scrub.activate(index);
                tapFeedback();
              }}
              className={`group relative flex min-h-11 min-w-0 flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full transition-colors active:bg-[var(--s2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-[var(--accent)] ${highlighted ? "text-[var(--accent)]" : "text-[var(--t3)]"}`}
              style={{
                WebkitTapHighlightColor: "transparent",
              }}
              title={
                item.signInRequired ? `Sign in to use ${item.name}` : item.name
              }
            >
              <motion.span
                className="relative z-10 grid h-7 w-8 place-items-center"
                tabIndex={-1}
                animate={
                  reducedMotion
                    ? undefined
                    : {
                        scale: highlighted ? 1.03 : 1,
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
                    strokeWidth: highlighted ? 2.4 : 1.8,
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
