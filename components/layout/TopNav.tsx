"use client";

import React, { Suspense, useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { MyStatesButton } from "@/components/shared/MyStatesButton";
import { Bell, Grid3X3, Lock } from "lucide-react";
import { useLocalSavedSearches } from "@/hooks/useLocalSavedSearches";
import { AccountMenu } from "@/components/home/AccountMenu";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import {
  navItemForViewer,
  primaryNavForMode,
  primaryJobForPath,
} from "./nav-items";

function IconBtn({
  href,
  title,
  children,
  badge,
}: {
  href: string;
  title: string;
  children: React.ReactNode;
  badge?: number;
}) {
  return (
    <Link
      href={href}
      title={title}
      aria-label={title}
      className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors text-[var(--t3)] hover:text-[var(--t1)]"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow2)" }}
    >
      {children}
      {badge != null && badge > 0 && (
        <span
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full text-[10px] font-bold text-white"
          style={{ background: "var(--amber)", lineHeight: 1 }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </Link>
  );
}

// One shared active-tab indicator: layoutId lets a single motion layer spring between tabs
// (and between the primary tabs and "More") instead of each one fading in place.
function NavPill() {
  return (
    <motion.span
      layoutId="topnav-pill"
      className="absolute inset-0 rounded-full"
      style={{
        background: "var(--grad)",
        boxShadow: "0 2px 12px var(--amber-lo)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    />
  );
}

export function TopNav() {
  return (
    <Suspense
      fallback={
        <header
          className="sticky top-0 z-30 flex h-14 items-center px-4 md:px-6"
          style={{ background: "var(--glass)" }}
        >
          <Link href="/discover" aria-label="MIKEHUNT home">
            <MikeHuntLogo />
          </Link>
        </header>
      }
    >
      <TopNavContent />
    </Suspense>
  );
}

function TopNavContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeJob = primaryJobForPath(pathname);
  const { intent } = useBuyerIntent();
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const primaryNav = primaryNavForMode(intent?.buyerMode).map((item) =>
    navItemForViewer(item, signedOut),
  );
  const alertsLink = navItemForViewer(
    { name: "Alerts", href: "/alerts", icon: Bell },
    signedOut,
  );
  const localSearches = useLocalSavedSearches();
  const [alertCount, setAlertCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [scopedStates, setScopedStates] = useState<string[] | undefined>();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const statesParam = params.get("states");
    const stateParam = params.get("state");
    const nextStates = statesParam
      ? statesParam
          .split(",")
          .map((state) => state.trim().toUpperCase())
          .filter(Boolean)
      : stateParam
        ? [stateParam.trim().toUpperCase()]
        : undefined;
    setScopedStates(nextStates?.length ? nextStates : undefined);
  }, [pathname, searchParams]);

  // Unread alerts are account data. Poll only once we know there is a session; a signed-out
  // visitor would just get a 401 every five minutes.
  useEffect(() => {
    if (!dealerId) {
      setAlertCount(0);
      return;
    }
    let cancelled = false;
    async function fetchAlerts() {
      try {
        const res = await fetch("/api/alerts/unread", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setAlertCount(data.count ?? 0);
      } catch {
        /* silent */
      }
    }
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 300_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [dealerId]);

  useEffect(() => {
    // The dashboard layout scrolls inside <body>, not the window, so window.scrollY stays 0 there
    // and a plain listener never fires. Capture-phase catches scrolls from any element.
    const onScroll = () => {
      const y =
        window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop;
      setScrolled(y > 4);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, {
      passive: true,
      capture: true,
    });
    return () =>
      window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  const totalAlertCount = alertCount + localSearches.count;
  const changeLocation = (states: string[]) => {
    setScopedStates(states);
    if (pathname === "/discover" || pathname === "/scan") {
      const params = new URLSearchParams(window.location.search);
      params.delete("state");
      params.delete("states");
      if (states.length === 1) params.set("state", states[0]);
      else if (states.length > 1) params.set("states", states.join(","));
      else params.set("state", "Nationwide");
      window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    } else router.refresh();
  };

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6"
      style={{
        background: "var(--glass)",
        backdropFilter: "blur(18px) saturate(180%)",
        WebkitBackdropFilter: "blur(18px) saturate(180%)",
        borderBottom: scrolled
          ? "1px solid var(--b1)"
          : "1px solid transparent",
        boxShadow: scrolled ? "var(--shadow2)" : "none",
        transition: "box-shadow 200ms ease, border-color 200ms ease",
      }}
    >
      {/* Gradient hairline — the "liquid" edge, revealed only once there's content scrolling
          behind the glass. Masked at the ends so it fades instead of stopping hard. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px transition-opacity duration-300"
        style={{
          background: "var(--grad)",
          opacity: scrolled ? 0.6 : 0,
          maskImage:
            "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent, #000 15%, #000 85%, transparent)",
        }}
      />
      {/* LEFT: Logo */}
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <Link
          href="/discover"
          aria-label="MIKEHUNT home"
          className="flex items-center gap-2.5 group"
        >
          <MikeHuntLogo
            size="sm"
            className="transition-transform group-hover:scale-[1.02]"
            wordmarkClassName="block md:hidden lg:block"
          />
        </Link>
        {activeJob && (
          <span className="hidden max-w-[8rem] truncate rounded-full border border-[var(--b1)] bg-[var(--s0)] px-2.5 py-1 text-[11px] font-black text-[var(--t4)] sm:inline-flex md:hidden">
            {activeJob}
          </span>
        )}
      </div>

      {/* CENTER: Daily buyer workflow — in the flow so it centers between the flex-1 sides and can't
          overlap them as the window narrows. */}
      <nav className="hidden md:flex items-center gap-0.5 shrink-0">
        {primaryNav.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/discover" && pathname === "/") ||
            activeJob === item.name;
          return (
            <Link
              key={item.name}
              href={item.href}
              title={
                item.signInRequired ? `Sign in to use ${item.name}` : item.name
              }
              aria-current={active ? "page" : undefined}
              aria-label={item.name}
              className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors ${
                active
                  ? "text-white"
                  : "text-[var(--t4)] hover:bg-[var(--s2)] hover:text-[var(--t1)]"
              }`}
            >
              {active && <NavPill />}
              <item.icon
                className="relative z-10 h-3.5 w-3.5"
                strokeWidth={active ? 2.5 : 2}
              />
              <span className="relative z-10 hidden lg:inline">
                {item.name}
              </span>
              {item.signInRequired && (
                <>
                  <Lock
                    aria-hidden
                    className="relative z-10 h-3 w-3 opacity-70"
                    strokeWidth={2.25}
                  />
                  <span className="sr-only">(sign in required)</span>
                </>
              )}
            </Link>
          );
        })}
      </nav>

      {/* RIGHT: Actions */}
      <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
        <div className="hidden items-center justify-end gap-2 md:flex">
          <MyStatesButton
            onChange={changeLocation}
            statesOverride={scopedStates}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 py-1.5 text-[12px] font-bold text-[var(--t3)] hover:text-[var(--t1)]"
          />
          <ThemeToggle />
          <IconBtn
            href={alertsLink.href}
            title={
              alertsLink.signInRequired
                ? "Sign in to see activity and alerts"
                : totalAlertCount
                  ? `${totalAlertCount} alert source${
                      totalAlertCount === 1 ? "" : "s"
                    }: ${alertCount} unread, ${localSearches.count} saved search${
                      localSearches.count === 1 ? "" : "es"
                    }`
                  : "Activity"
            }
            badge={alertsLink.signInRequired ? undefined : totalAlertCount}
          >
            <Bell style={{ width: 17, height: 17 }} />
          </IconBtn>
          <AccountMenu floating={false} />
          <IconBtn href="/tools" title="All tools">
            <Grid3X3 className="h-5 w-5" aria-hidden="true" />
          </IconBtn>
        </div>

        <div className="flex items-center justify-end gap-2 md:hidden">
          <MyStatesButton
            onChange={changeLocation}
            statesOverride={scopedStates}
            className="inline-flex max-w-[88px] items-center gap-1.5 truncate rounded-full border border-[var(--b1)] bg-[var(--s0)] px-2.5 py-2 text-[12px] font-black text-[var(--t3)] shadow-[var(--shadow2)]"
          />
          <AccountMenu floating={false} />
        </div>
      </div>
    </header>
  );
}
