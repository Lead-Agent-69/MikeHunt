import {
  Activity,
  ArrowLeftRight,
  Banknote,
  BellRing,
  CalendarDays,
  Clock,
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
  ScanLine,
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

export type NavItem = { name: string; href: string; icon: LucideIcon };
export type NavGroup = { group: string; items: NavItem[] };

// Single source of truth for navigation. TopNav (desktop) and BottomNav (mobile) both read this,
// so a route added here is reachable on both form factors — previously each file kept its own copy
// and they drifted, leaving /best-buy, /dealer-network, /lane and /feed unreachable on mobile.

/** The daily-driver routes. Desktop shows all of them; mobile shows the first MOBILE_TAB_COUNT. */
export const PRIMARY: NavItem[] = [
  { name: "Discover", href: "/discover", icon: Compass },
  { name: "Feed", href: "/feed", icon: Flame },
  { name: "Scan", href: "/scan", icon: Search },
  { name: "Market", href: "/market", icon: SlidersHorizontal },
  { name: "Deal Check", href: "/deal-check", icon: FileCheck },
  { name: "Fleet", href: "/fleet", icon: Clock },
];

/** How many PRIMARY tabs the mobile bottom bar can fit before the "More" button. */
export const MOBILE_TAB_COUNT = 5;

export const MORE_GROUPS: NavGroup[] = [
  {
    group: "Find deals",
    items: [
      { name: "Next Best Buy", href: "/best-buy", icon: Flame },
      { name: "Swipe", href: "/swipe", icon: Layers },
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
      { name: "Settings", href: "/settings", icon: Settings },
      { name: "Upgrade", href: "/upgrade", icon: Sparkles },
      { name: "What's new", href: "/changelog", icon: FileText },
      { name: "Showcase", href: "/showcase", icon: Sparkles },
    ],
  },
];

/** Appended to "More" only for the single admin — the routes are server-gated too. */
export const ADMIN_GROUP: NavGroup = {
  group: "Admin",
  items: [
    { name: "Admin Dashboard", href: "/admin", icon: Shield },
    { name: "System status", href: "/status", icon: Activity },
    { name: "Developer API", href: "/developer", icon: Code2 },
    { name: "Orchestrator", href: "/orchestrator", icon: Cpu },
  ],
};
