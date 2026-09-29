"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { MyStatesButton } from "@/components/shared/MyStatesButton";
import {
  BarChart3,
  Bell,
  Bookmark,
  ChevronDown,
  Settings,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AccountMenu } from "@/components/home/AccountMenu";
import { PRIMARY, MORE_GROUPS, ADMIN_GROUP } from "./nav-items";

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
      className="relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors text-[var(--t3)] hover:text-[var(--t1)]"
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
  const pathname = usePathname();
  const router = useRouter();
  const { isAdmin } = useIsAdmin();
  // The admin sees everything — their "More" gains the Admin group with the dev/ops surfaces.
  const moreGroups = isAdmin ? [...MORE_GROUPS, ADMIN_GROUP] : MORE_GROUPS;
  const moreHrefs = moreGroups.flatMap((g) => g.items.map((i) => i.href));
  const [alertCount, setAlertCount] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, []);

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

  // Close the More menu on navigation or outside click.
  useEffect(() => setMoreOpen(false), [pathname]);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node))
        setMoreOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const moreActive = moreHrefs.includes(pathname);

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
        <Link href="/discover" className="flex items-center gap-2.5 group">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-105"
            style={{ background: "var(--grad)" }}
          >
            <BarChart3 className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-[var(--t1)] hidden lg:block">
            MikeHunt<span className="text-[var(--amber)] ml-0.5">Pro</span>
          </span>
        </Link>
      </div>

      {/* CENTER: Primary nav + More (desktop) — in the flow so it centers between the flex-1 sides and can't
          overlap them as the window narrows. */}
      <nav className="hidden md:flex items-center gap-0.5 shrink-0">
        {PRIMARY.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/discover" && pathname === "/");
          return (
            <Link
              key={item.name}
              href={item.href}
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
              <span className="relative z-10">{item.name}</span>
            </Link>
          );
        })}

        {/* More dropdown */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((o) => !o)}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`relative flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors ${
              moreActive
                ? "text-white"
                : "text-[var(--t4)] hover:bg-[var(--s2)] hover:text-[var(--t1)]"
            }`}
          >
            {moreActive && <NavPill />}
            <span className="relative z-10">More</span>
            <ChevronDown
              className="relative z-10 h-3 w-3 transition-transform"
              style={{ transform: moreOpen ? "rotate(180deg)" : "none" }}
            />
          </button>

          <AnimatePresence>
            {moreOpen && (
              <motion.div
                role="menu"
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="absolute right-0 mt-2 w-60 p-2 rounded-[var(--r3)] z-50 origin-top-right overflow-hidden"
                style={{
                  background: "var(--glass)",
                  backdropFilter: "blur(24px) saturate(180%)",
                  WebkitBackdropFilter: "blur(24px) saturate(180%)",
                  border: "1px solid var(--b1)",
                  boxShadow: "var(--shadow)",
                }}
              >
                {/* Top highlight — the same glass cue the landing CTAs use. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-[10%] top-0 h-px rounded-full"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent)",
                  }}
                />
                <div className="max-h-[min(70vh,34rem)] overflow-y-auto overscroll-contain">
                  {moreGroups.map((g) => (
                    <div key={g.group} className="mb-1.5 last:mb-0">
                      <p className="px-2 py-1 text-[10px] uppercase tracking-wider font-bold text-[var(--t5)]">
                        {g.group}
                      </p>
                      {g.items.map((item) => {
                        const active = pathname === item.href;
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            role="menuitem"
                            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r2)] text-[13px] font-medium transition-colors ${
                              active
                                ? "bg-[var(--amber-lo)] text-[var(--amber)]"
                                : "text-[var(--t2)] hover:bg-[var(--s2)]"
                            }`}
                          >
                            <item.icon className="h-4 w-4 text-[var(--t4)]" />
                            {item.name}
                          </Link>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* RIGHT: Actions */}
      <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
        <MyStatesButton
          onChange={() => router.refresh()}
          className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-[var(--b1)] bg-[var(--s0)] px-3 py-1.5 text-[12px] font-bold text-[var(--t3)] hover:text-[var(--t1)]"
        />
        <ThemeToggle />
        <IconBtn href="/saved" title="Saved">
          <Bookmark style={{ width: 17, height: 17 }} />
        </IconBtn>
        <IconBtn href="/alerts" title="Alerts" badge={alertCount}>
          <Bell style={{ width: 17, height: 17 }} />
        </IconBtn>
        <IconBtn href="/settings" title="Settings">
          <Settings style={{ width: 17, height: 17 }} />
        </IconBtn>
        {/* Account menu + logout (inline so it doesn't float over the nav). */}
        <AccountMenu floating={false} />
      </div>
    </header>
  );
}
