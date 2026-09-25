"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { MyStatesButton } from "@/components/shared/MyStatesButton";
import {
  Search,
  Clock,
  Settings,
  Bell,
  Bookmark,
  BarChart3,
  Compass,
  TrendingUp,
  FileCheck,
  Sparkles,
  MapPin,
  FileText,
  ChevronDown,
  BellRing,
  Code2,
  Activity,
  Cpu,
  SlidersHorizontal,
  Wrench,
  ArrowLeftRight,
  CalendarDays,
  Zap,
  Columns3,
  Truck,
  Hammer,
  ListPlus,
  Layers,
  Banknote,
  Store,
  Gavel,
  Flame,
  ScanLine,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AccountMenu } from "@/components/home/AccountMenu";

// PRIMARY = the 5 daily-driver routes (kept in sync with the mobile bottom nav). Everything else lives in
// the grouped "More" menu so the bar stays uncluttered on desktop and mobile.
const PRIMARY = [
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Feed", href: "/feed", icon: Flame },
  { name: "Scan", href: "/scan", icon: Search },
  { name: "Market", href: "/market", icon: SlidersHorizontal },
  { name: "Deal Check", href: "/deal-check", icon: FileCheck },
  { name: "Fleet", href: "/fleet", icon: Clock },
];

const MORE_GROUPS = [
  {
    group: "Find deals",
    items: [
      { name: "Arbitrage", href: "/arbitrage", icon: ArrowLeftRight },
      { name: "Map", href: "/map", icon: MapPin },
      { name: "Today", href: "/today", icon: CalendarDays },
      { name: "Flash deals", href: "/flash-deals", icon: Zap },
      { name: "Compare", href: "/compare", icon: Columns3 },
      { name: "Dealer network", href: "/dealer-network", icon: Store },
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
      { name: "Lane Scanner", href: "/lane", icon: ScanLine },
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
      { name: "Upgrade", href: "/upgrade", icon: Sparkles },
      { name: "What's new", href: "/changelog", icon: FileText },
    ],
  },
];

// Admin-only group — appended to "More" only when the single admin is signed in (server-gated too).
const ADMIN_GROUP = {
  group: "Admin",
  items: [
    { name: "System status", href: "/status", icon: Activity },
    { name: "Developer API", href: "/developer", icon: Code2 },
    { name: "Orchestrator", href: "/orchestrator", icon: Cpu },
  ],
};

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
    const onScroll = () => setScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
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

  const tabStyle = (active: boolean): React.CSSProperties =>
    active
      ? { background: "var(--grad)", color: "#fff" }
      : { color: "var(--t4)" };

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between px-4 md:px-6"
      style={{
        background: scrolled ? "var(--s0)" : "var(--s1)",
        borderBottom: scrolled
          ? "1px solid var(--b1)"
          : "1px solid transparent",
        boxShadow: scrolled ? "var(--shadow2)" : "none",
        transition: "all 200ms ease",
      }}
    >
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
            DealerHunt<span className="text-[var(--amber)] ml-0.5">Pro</span>
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
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all"
              style={tabStyle(active)}
              onMouseEnter={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background =
                    "var(--s2)";
                  (e.currentTarget as HTMLElement).style.color = "var(--t1)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active) {
                  (e.currentTarget as HTMLElement).style.background =
                    "transparent";
                  (e.currentTarget as HTMLElement).style.color = "var(--t4)";
                }
              }}
            >
              <item.icon
                className="h-3.5 w-3.5"
                strokeWidth={active ? 2.5 : 2}
              />
              {item.name}
            </Link>
          );
        })}

        {/* More dropdown */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setMoreOpen((o) => !o)}
            className="flex items-center gap-1 px-3.5 py-2 rounded-full text-[13px] font-semibold transition-all"
            style={tabStyle(moreActive)}
            onMouseEnter={(e) => {
              if (!moreActive) {
                (e.currentTarget as HTMLElement).style.background = "var(--s2)";
                (e.currentTarget as HTMLElement).style.color = "var(--t1)";
              }
            }}
            onMouseLeave={(e) => {
              if (!moreActive) {
                (e.currentTarget as HTMLElement).style.background =
                  "transparent";
                (e.currentTarget as HTMLElement).style.color = "var(--t4)";
              }
            }}
          >
            More
            <ChevronDown
              className="h-3 w-3 transition-transform"
              style={{ transform: moreOpen ? "rotate(180deg)" : "none" }}
            />
          </button>

          {moreOpen && (
            <div
              className="absolute right-0 mt-2 w-60 p-2 rounded-[var(--r3)] z-50"
              style={{
                background: "var(--s0)",
                border: "1px solid var(--b1)",
                boxShadow: "var(--shadow)",
              }}
            >
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
                        className="flex items-center gap-2.5 px-2 py-1.5 rounded-[var(--r2)] text-[13px] font-medium transition-colors"
                        style={{
                          color: active ? "var(--amber)" : "var(--t2)",
                          background: active
                            ? "var(--amber-lo)"
                            : "transparent",
                        }}
                        onMouseEnter={(e) => {
                          if (!active)
                            (e.currentTarget as HTMLElement).style.background =
                              "var(--s2)";
                        }}
                        onMouseLeave={(e) => {
                          if (!active)
                            (e.currentTarget as HTMLElement).style.background =
                              "transparent";
                        }}
                      >
                        <item.icon className="h-4 w-4 text-[var(--t4)]" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
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
