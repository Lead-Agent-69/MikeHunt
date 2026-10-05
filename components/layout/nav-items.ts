import {
  Activity,
  ArrowLeftRight,
  Banknote,
  BellRing,
  Bookmark,
  CalendarDays,
  Clock,
  CircleUserRound,
  Code2,
  Columns3,
  Compass,
  Cpu,
  FileCheck,
  FileText,
  Flame,
  Gavel,
  Hammer,
  Layers,
  ListPlus,
  MapPin,
  Search,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Store,
  TrendingUp,
  Truck,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isFlipBuyerMode, normalizeFlipLeadMode } from "@/lib/buyer/flip-lead";

export type NavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  description?: string;
};
export type NavGroup = { group: string; items: NavItem[] };
export type PrimaryJob =
  | "Discover"
  | "Deal Check"
  | "Auction Lane"
  | "Pipeline"
  | "Saved";

// Single source of truth for navigation. TopNav (desktop) and BottomNav (mobile) both read this,
// so a route added here is reachable on both form factors — previously each file kept its own copy
// and they drifted, leaving /best-buy, /dealer-network, /lane and /feed unreachable on mobile.

/** The desktop daily-driver routes from the acquisition workflow. */
export const PRIMARY: NavItem[] = [
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Deal Check", href: "/deal-check", icon: FileCheck },
  { name: "Auction Lane", href: "/lane", icon: Gavel },
  { name: "Pipeline", href: "/fleet", icon: Clock },
  { name: "Saved", href: "/saved", icon: Bookmark },
];

/** The mobile bottom bar exposes the four daily buyer actions plus account. */
export const MOBILE_TAB_COUNT = 5;

/** Auction work remains available from a listing or watchlist rather than taking a permanent tab. */
export const MOBILE_PRIMARY: NavItem[] = [
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Deal Check", href: "/deal-check", icon: FileCheck },
  { name: "Saved", href: "/saved", icon: Bookmark },
  { name: "Pipeline", href: "/fleet", icon: Clock },
  { name: "Account", href: "/settings", icon: CircleUserRound },
];

/**
 * Wholesale flip tools: auction lanes, the dealer pipeline, and arbitrage.
 * Personal, DIY, and parts buyers do not get these as tabs. The routes still
 * work if opened directly; they are just not offered in the nav.
 */
export const FLIP_ONLY_HREFS: readonly string[] = [
  "/lane",
  "/auctions",
  "/fleet",
  "/arbitrage",
];

const ALERTS_TAB: NavItem = { name: "Alerts", href: "/alerts", icon: BellRing };

/**
 * Hide flip tools only for a known non-flip desk. A missing mode keeps the
 * full nav so a dealer on a new device does not lose Auction or Pipeline.
 */
export function hidesFlipNav(buyerMode: unknown): boolean {
  return (
    normalizeFlipLeadMode(buyerMode) !== undefined &&
    !isFlipBuyerMode(buyerMode)
  );
}

function isFlipOnly(item: NavItem) {
  return FLIP_ONLY_HREFS.includes(item.href);
}

/** Desktop primary nav for the saved buyer mode. */
export function primaryNavForMode(buyerMode: unknown): NavItem[] {
  if (!hidesFlipNav(buyerMode)) return PRIMARY;
  return [...PRIMARY.filter((item) => !isFlipOnly(item)), ALERTS_TAB];
}

/** Mobile tabs for the saved buyer mode. Keeps five tabs: Pipeline becomes Alerts. */
export function mobileNavForMode(buyerMode: unknown): NavItem[] {
  if (!hidesFlipNav(buyerMode)) return MOBILE_PRIMARY;
  return MOBILE_PRIMARY.map((item) => (isFlipOnly(item) ? ALERTS_TAB : item));
}

/**
 * Scan entry point for the saved buyer mode. Flip desks sort by profit; other
 * desks sort by trust score, since profit is not their goal.
 */
export function scanHrefForMode(buyerMode: unknown): string {
  return hidesFlipNav(buyerMode) ? "/scan?sort=score" : "/scan?sort=profit";
}

/** Grouped "More" routes for the saved buyer mode. */
export function moreGroupsForMode(buyerMode: unknown): NavGroup[] {
  if (!hidesFlipNav(buyerMode)) return MORE_GROUPS;
  return MORE_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !isFlipOnly(item)),
  })).filter((group) => group.items.length > 0);
}

export const MORE_GROUPS: NavGroup[] = [
  {
    group: "Discover",
    items: [
      {
        name: "Today",
        href: "/today",
        icon: CalendarDays,
        description: "Daily shortlist and time-sensitive tasks.",
      },
      {
        name: "Search",
        href: "/find",
        icon: Search,
        description: "Direct search for a make, model, VIN, or buyer goal.",
      },
      {
        name: "Live feed",
        href: "/feed",
        icon: Flame,
        description: "Fresh rows from active public/source feeds.",
      },
      {
        name: "Swipe deals",
        href: "/swipe",
        icon: Layers,
        description: "Fast yes/no review for today’s candidates.",
      },
      {
        name: "Map search",
        href: "/map",
        icon: MapPin,
        description: "Browse opportunities by state and distance.",
      },
      {
        name: "Flash deals",
        href: "/flash-deals",
        icon: Zap,
        description: "Urgent listings and auctions ending soon.",
      },
    ],
  },
  {
    group: "Discover collections",
    items: [
      {
        name: "Scan inventory",
        href: "/scan",
        icon: Search,
        description: "Run the full search workflow against matching sources.",
      },
      {
        name: "Next Best Buy",
        href: "/best-buy",
        icon: Flame,
        description: "Single best candidate after profit/risk scoring.",
      },
    ],
  },
  {
    group: "Market",
    items: [
      {
        name: "Market",
        href: "/market",
        icon: SlidersHorizontal,
        description: "Pricing, demand, timing, and market signals.",
      },
      {
        name: "Arbitrage",
        href: "/arbitrage",
        icon: ArrowLeftRight,
        description: "Compare local buy prices against resale markets.",
      },
      {
        name: "Compare",
        href: "/compare",
        icon: Columns3,
        description: "Side-by-side vehicle and deal comparison.",
      },
      {
        name: "Intel",
        href: "/insights",
        icon: TrendingUp,
        description: "Source ROI and portfolio-level buying signals.",
      },
      {
        name: "Parts",
        href: "/parts",
        icon: Wrench,
        description: "Part-out and teardown value checks.",
      },
    ],
  },
  {
    group: "Saved",
    items: [
      {
        name: "Saved searches",
        href: "/searches",
        icon: BellRing,
        description: "Reusable filters for repeat sourcing.",
      },
      {
        name: "Alerts",
        href: "/alerts",
        icon: BellRing,
        description: "Price drops, watchlist changes, and local saves.",
      },
      {
        name: "Dealer network",
        href: "/dealer-network",
        icon: Store,
        description: "Small shops, watched dealers, and catalog proof.",
      },
    ],
  },
  {
    group: "Auction Lane",
    items: [
      {
        name: "Auctions",
        href: "/auctions",
        icon: Gavel,
        description: "Auction calendar, bids, and ending lots.",
      },
    ],
  },
  {
    group: "Pipeline",
    items: [
      {
        name: "Transport",
        href: "/move",
        icon: Truck,
        description: "Estimate shipping before committing capital.",
      },
      {
        name: "Recon",
        href: "/recon",
        icon: Hammer,
        description: "Repair/reconditioning assumptions and costs.",
      },
      {
        name: "List a car",
        href: "/list",
        icon: ListPlus,
        description: "Prepare a vehicle for resale.",
      },
      {
        name: "Bulk actions",
        href: "/bulk",
        icon: Layers,
        description: "Batch review and cleanup workflows.",
      },
      {
        name: "Finance",
        href: "/finance",
        icon: Banknote,
        description: "Capital, floorplan, and lender tools.",
      },
    ],
  },
  {
    group: "Account",
    items: [
      {
        name: "Settings",
        href: "/settings",
        icon: Settings,
        description: "Markets, budgets, alerts, and account defaults.",
      },
      {
        name: "Upgrade",
        href: "/upgrade",
        icon: Sparkles,
        description: "Plan limits and premium sourcing tools.",
      },
      {
        name: "What's new",
        href: "/changelog",
        icon: FileText,
        description: "Recent changes and shipped improvements.",
      },
    ],
  },
];

export function navItemMatchesPath(item: NavItem, pathname: string) {
  const normalized = pathname === "/" ? "/discover" : pathname;
  return normalized === item.href || normalized.startsWith(`${item.href}/`);
}

export function primaryJobForPath(pathname: string): PrimaryJob | null {
  const normalized = pathname === "/" ? "/discover" : pathname;
  const primary = PRIMARY.find((item) => navItemMatchesPath(item, normalized));
  if (primary) return primary.name as PrimaryJob;

  for (const group of MORE_GROUPS) {
    if (
      ![
        "Discover",
        "Discover collections",
        "Deal Check",
        "Auction Lane",
        "Pipeline",
        "Saved",
      ].includes(group.group)
    ) {
      continue;
    }
    if (group.items.some((item) => navItemMatchesPath(item, normalized))) {
      if (group.group === "Discover collections") return "Discover";
      return group.group as PrimaryJob;
    }
  }

  if (normalized.startsWith("/deal/")) return "Discover";
  if (normalized.startsWith("/dealer-network")) return "Saved";
  if (
    normalized.startsWith("/save") ||
    normalized.startsWith("/searches") ||
    normalized.startsWith("/alerts")
  ) {
    return "Saved";
  }
  if (
    normalized.startsWith("/scan") ||
    normalized.startsWith("/best-buy") ||
    normalized.startsWith("/feed") ||
    normalized.startsWith("/flash-deals") ||
    normalized.startsWith("/map") ||
    normalized.startsWith("/swipe") ||
    normalized.startsWith("/today") ||
    normalized.startsWith("/find")
  ) {
    return "Discover";
  }
  if (normalized.startsWith("/deal-check")) return "Deal Check";
  if (normalized.startsWith("/lane") || normalized.startsWith("/auctions")) {
    return "Auction Lane";
  }
  if (
    normalized.startsWith("/fleet") ||
    normalized.startsWith("/move") ||
    normalized.startsWith("/recon") ||
    normalized.startsWith("/list") ||
    normalized.startsWith("/bulk") ||
    normalized.startsWith("/finance")
  ) {
    return "Pipeline";
  }
  if (
    normalized.startsWith("/market") ||
    normalized.startsWith("/arbitrage") ||
    normalized.startsWith("/overview") ||
    normalized.startsWith("/compare") ||
    normalized.startsWith("/insights") ||
    normalized.startsWith("/parts")
  ) {
    return "Discover";
  }
  return null;
}

export function navJobCoverage() {
  const covered = new Map<PrimaryJob, NavItem[]>(
    PRIMARY.map((item) => [item.name as PrimaryJob, [item]]),
  );
  for (const group of MORE_GROUPS) {
    if (
      ![
        "Discover",
        "Discover collections",
        "Auction Lane",
        "Pipeline",
        "Saved",
      ].includes(group.group)
    ) {
      continue;
    }
    const key =
      group.group === "Discover collections"
        ? "Discover"
        : (group.group as PrimaryJob);
    covered.set(key, [...(covered.get(key) || []), ...group.items]);
  }
  return covered;
}

/** Appended to "More" only for the single admin — the routes are server-gated too. */
export const ADMIN_GROUP: NavGroup = {
  group: "Admin",
  items: [
    { name: "Admin Dashboard", href: "/admin", icon: Shield },
    {
      name: "Source operations",
      href: "/sources",
      icon: Store,
      description: "Coverage, freshness, source status, and recovery actions.",
    },
    {
      name: "System health",
      href: "/status",
      icon: Activity,
      description:
        "Account connections, deployment readiness, and diagnostics.",
    },
    {
      name: "Developer API",
      href: "/developer",
      icon: Code2,
      description: "Public API docs and integration details.",
    },
    {
      name: "Orchestrator",
      href: "/orchestrator",
      icon: Cpu,
      description: "Scraper jobs, queues, and source execution.",
    },
  ],
};
