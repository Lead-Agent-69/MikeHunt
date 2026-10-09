"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  CircleHelp,
  Flame,
  Gavel,
  Layers,
  LogIn,
  LogOut,
  ShieldCheck,
  MapPin,
  ScanSearch,
  Search,
  Settings,
  Store,
  Wrench,
  ArrowLeftRight,
  Banknote,
  ChartNoAxesCombined,
  CircleUserRound,
  ClipboardList,
  FileCheck,
  ListPlus,
  Truck,
  CalendarDays,
  Sparkles,
  Zap,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import { accountMenuForMode } from "@/components/layout/nav-items";
import { ThemeToggle } from "@/components/shared/ThemeToggle";

const MENU_ICONS: Record<string, LucideIcon> = {
  "/saved": Bookmark,
  "/searches": Search,
  "/alerts": Bell,
  "/parts": Wrench,
  "/feed": Flame,
  "/map": MapPin,
  "/swipe": Layers,
  "/auctions": Gavel,
  "/dealer-network": Store,
  "/lane": Gavel,
  "/settings": Settings,
  "/changelog": CircleHelp,
  "/deal-check": FileCheck,
  "/compare": ArrowLeftRight,
  "/insights": ChartNoAxesCombined,
  "/market": ChartNoAxesCombined,
  "/arbitrage": ArrowLeftRight,
  "/fleet": ClipboardList,
  "/move": Truck,
  "/recon": Wrench,
  "/list": ListPlus,
  "/bulk": Layers,
  "/finance": Banknote,
  "/today": CalendarDays,
  "/flash-deals": Zap,
  "/upgrade": Sparkles,
};

function menuIcon(href: string): LucideIcon {
  return MENU_ICONS[href.split("?")[0]] ?? ScanSearch;
}

// The account menu present on every app surface — jump to settings and LOG OUT. `floating` (default) pins
// it top-right; pass floating={false} to drop it inline into a nav bar's right side.
export function AccountMenu({ floating = true }: { floating?: boolean }) {
  const router = useRouter();
  const { intent } = useBuyerIntent();
  // Buyer tools are mode-specific; operator access is checked separately by the server.
  const menu = accountMenuForMode(intent?.buyerMode);
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const panelId = useId();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    ref.current?.querySelector<HTMLElement>(`[id="${panelId}"] a`)?.focus();
  }, [open, panelId]);
  useEffect(() => {
    if (!open || !dealerId) return;
    const controller = new AbortController();
    setAdminUserId(null);
    fetch("/api/auth/whoami", { signal: controller.signal, cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((viewer) => {
        if (
          !controller.signal.aborted &&
          viewer?.isAdmin === true &&
          viewer.id === dealerId
        )
          setAdminUserId(dealerId);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [open, dealerId]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        ref.current
          ?.querySelector<HTMLButtonElement>(
            'button[aria-label="Account menu"]',
          )
          ?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    const onDoc = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc);
    return () => document.removeEventListener("pointerdown", onDoc);
  }, []);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(null);
    try {
      if (isSupabaseConfigured()) {
        const { error } = await createClientComponentClient().auth.signOut();
        if (error) throw error;
      } else {
        window.location.assign("/api/auth/demo-logout?next=/login");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Could not log out. Check your connection and try again.");
      setLoggingOut(false);
    }
  }

  function MenuLink({
    entry,
    icon,
  }: {
    entry: { name: string; href: string };
    icon?: LucideIcon;
  }) {
    const Icon = icon ?? menuIcon(entry.href);
    const label = entry.href === "/alerts" ? "Activity" : entry.name;
    return (
      <Link
        href={entry.href}
        prefetch={false}
        onClick={() => setOpen(false)}
        className={item}
      >
        <Icon className="h-4 w-4" aria-hidden="true" /> {label}
      </Link>
    );
  }

  const item =
    "min-h-11 w-full text-left px-3 py-2 text-sm font-semibold text-[var(--t2)] hover:bg-[var(--s2)] active:bg-[var(--s2)] transition-colors rounded-lg flex items-center gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]";

  return (
    <div
      ref={ref}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          setOpen(false);
      }}
      className={floating ? "fixed top-3 right-3 z-[60]" : "relative z-[60]"}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        title="Account and tools"
        className="w-11 h-11 grid place-items-center rounded-full border border-[var(--b1)] bg-[var(--s0)] text-[var(--t2)] hover:border-[var(--b3)] active:bg-[var(--s2)] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] shadow-[var(--shadow2)]"
      >
        <CircleUserRound className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Account and tools"
          className="absolute z-[70] top-12 right-0 w-72 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-150px-env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain p-1.5 rounded-lg border border-[var(--b1)] bg-[var(--s0)] shadow-[var(--shadow)]"
        >
          {signedOut ? (
            <>
              <MenuLink
                entry={{ name: "Sign in", href: "/login" }}
                icon={LogIn}
              />
              <MenuLink
                entry={{ name: "Help & updates", href: "/changelog" }}
              />
            </>
          ) : (
            <>
              {menu.primary
                .filter((entry) => entry.href !== "/saved")
                .map((entry) => (
                  <MenuLink key={entry.href} entry={entry} />
                ))}
              <div className="my-1 border-t border-[var(--b1)]" />
              <details className="group/tools">
                <summary
                  className={`${item} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
                >
                  <ScanSearch className="h-4 w-4" aria-hidden="true" />
                  Explore tools
                  <ChevronDown
                    className="ml-auto h-4 w-4 transition-transform motion-reduce:transition-none group-open/tools:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                {menu.tools.map((entry, index) => (
                  <div key={entry.href}>
                    {entry.group !== menu.tools[index - 1]?.group && (
                      <p className="px-3 pt-3 pb-1 text-xs font-semibold text-[var(--t3)]">
                        {entry.group}
                      </p>
                    )}
                    <MenuLink entry={entry} />
                  </div>
                ))}
              </details>
              <div className="my-1 border-t border-[var(--b1)]" />
              {menu.secondary.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
              <div className="lg:hidden border-t border-[var(--b1)] mt-1 pt-1">
                <ThemeToggle showLabel />
              </div>
              {dealerId && adminUserId === dealerId && (
                <>
                  <div className="my-1 border-t border-[var(--b1)]" />
                  <MenuLink
                    entry={{ name: "Admin dashboard", href: "/admin" }}
                    icon={ShieldCheck}
                  />
                  <MenuLink
                    entry={{ name: "Source operations", href: "/sources" }}
                  />
                </>
              )}
            </>
          )}
          {!signedOut && (
            <>
              <div className="my-1 border-t border-[var(--b1)]" />
              <button
                onClick={logout}
                disabled={loggingOut}
                className={`${item} text-[var(--red)] hover:text-[var(--red)]`}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {loggingOut ? "Logging out…" : "Log out"}
              </button>
              {logoutError && (
                <p role="alert" className="px-3 py-2 text-xs text-[var(--red)]">
                  {logoutError}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
