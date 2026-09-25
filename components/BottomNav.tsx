"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Compass,
  Search,
  SlidersHorizontal,
  FileCheck,
  Clock,
  Menu,
  X,
  ArrowLeftRight,
  MapPin,
  CalendarDays,
  Zap,
  Columns3,
  TrendingUp,
  Wrench,
  Truck,
  Hammer,
  ListPlus,
  Layers,
  Banknote,
  BellRing,
  Sparkles,
  FileText,
  Settings,
  Gavel,
} from "lucide-react";

// Core 5 tabs — identical to the desktop TopNav primary so nav is consistent across mobile/desktop.
const NAV_ITEMS = [
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Scan", href: "/scan", icon: Search },
  { name: "Market", href: "/market", icon: SlidersHorizontal },
  { name: "Deal Check", href: "/deal-check", icon: FileCheck },
  { name: "Fleet", href: "/fleet", icon: Clock },
];

// Secondary sections — the mobile twin of the desktop TopNav "More" menu (kept in sync). Before this,
// these were UNREACHABLE on mobile (the desktop primary+More is hidden md:flex, bottom nav had no More).
const MORE_GROUPS = [
  {
    group: "Find deals",
    items: [
      { name: "Arbitrage", href: "/arbitrage", icon: ArrowLeftRight },
      { name: "Map", href: "/map", icon: MapPin },
      { name: "Today", href: "/today", icon: CalendarDays },
      { name: "Flash deals", href: "/flash-deals", icon: Zap },
      { name: "Compare", href: "/compare", icon: Columns3 },
      { name: "Find", href: "/find", icon: Search },
    ],
  },
  {
    group: "Analyze",
    items: [
      { name: "Intel", href: "/insights", icon: TrendingUp },
      { name: "Parts", href: "/parts", icon: Wrench },
    ],
  },
  {
    group: "Operations",
    items: [
      { name: "Auctions", href: "/auctions", icon: Gavel },
      { name: "Transport", href: "/move", icon: Truck },
      { name: "Recon", href: "/recon", icon: Hammer },
      { name: "List a car", href: "/list", icon: ListPlus },
      { name: "Bulk actions", href: "/bulk", icon: Layers },
      { name: "Finance", href: "/finance", icon: Banknote },
    ],
  },
  {
    group: "Account",
    items: [
      { name: "Saved searches", href: "/searches", icon: BellRing },
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Upgrade", href: "/upgrade", icon: Sparkles },
      { name: "What's new", href: "/changelog", icon: FileText },
    ],
  },
];

export function BottomNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Close the sheet on navigation.
  useEffect(() => setMoreOpen(false), [pathname]);
  // Lock body scroll while the sheet is open.
  useEffect(() => {
    if (!moreOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [moreOpen]);

  const tabStyle = (active: boolean) => ({
    color: active ? "var(--amber)" : "var(--t4)",
  });
  const iconStyle = (active: boolean) => ({
    width: 22,
    height: 22,
    strokeWidth: active ? 2.5 : 1.75,
    transition: "all 150ms ease",
    transform: active ? "translateY(-1px)" : "none",
  });
  const labelStyle = (active: boolean) => ({
    fontSize: 10.5,
    fontWeight: active ? 700 : 600,
    letterSpacing: "0.02em",
  });

  return (
    <>
      {/* Slide-up "More" sheet — grouped access to every secondary section on mobile. */}
      {moreOpen && (
        <div className="md:hidden fixed inset-0 z-[60]">
          <button
            aria-label="Close menu"
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0"
            style={{ background: "rgba(0,0,0,.45)" }}
          />
          <div
            className="absolute bottom-0 left-0 right-0 rounded-t-2xl max-h-[80vh] overflow-y-auto p-4 pb-[calc(16px+env(safe-area-inset-bottom))]"
            style={{
              background: "var(--s0)",
              borderTop: "1px solid var(--b1)",
              boxShadow: "0 -8px 30px rgba(0,0,0,.25)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-black text-[var(--t2)]">More</span>
              <button
                onClick={() => setMoreOpen(false)}
                aria-label="Close"
                className="h-8 w-8 grid place-items-center rounded-lg text-[var(--t4)]"
              >
                <X style={{ width: 18, height: 18 }} />
              </button>
            </div>
            {MORE_GROUPS.map((g) => (
              <div key={g.group} className="mb-4">
                <div className="text-[11px] font-black uppercase tracking-widest text-[var(--t4)] mb-2">
                  {g.group}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {g.items.map((it) => (
                    <Link
                      key={it.name}
                      href={it.href}
                      className="flex items-center gap-2.5 rounded-xl border border-[var(--b1)] bg-[var(--s1)] px-3 py-2.5 text-[var(--t2)] active:bg-[var(--s2)]"
                    >
                      <it.icon style={{ width: 17, height: 17 }} />
                      <span className="text-[13px] font-semibold">
                        {it.name}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-stretch"
        style={{
          background: "var(--s0)",
          borderTop: "1px solid var(--b1)",
          boxShadow: "0 -4px 20px rgba(60,30,60,.07)",
          height: "calc(56px + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href === "/discover" && pathname === "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className="flex flex-1 flex-col items-center justify-center gap-1 transition-all"
              style={tabStyle(isActive)}
            >
              <item.icon style={iconStyle(isActive)} />
              <span style={labelStyle(isActive)}>{item.name}</span>
            </Link>
          );
        })}
        {/* More — opens the grouped sheet so every section is reachable on mobile. */}
        <button
          onClick={() => setMoreOpen((o) => !o)}
          className="flex flex-1 flex-col items-center justify-center gap-1 transition-all"
          style={tabStyle(moreOpen)}
          aria-label="More"
        >
          <Menu style={iconStyle(moreOpen)} />
          <span style={labelStyle(moreOpen)}>More</span>
        </button>
      </nav>
    </>
  );
}
