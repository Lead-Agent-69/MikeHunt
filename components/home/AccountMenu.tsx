"use client";

import { useEffect, useRef, useState } from "react";
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
  type LucideIcon,
} from "lucide-react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import { accountMenuForMode } from "@/components/layout/nav-items";

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
  const ref = useRef<HTMLDivElement>(null);
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
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
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

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  function MenuLink({
    entry,
    icon,
  }: {
    entry: { name: string; href: string };
    icon?: LucideIcon;
  }) {
    const Icon = icon ?? menuIcon(entry.href);
    return (
      <button onClick={() => go(entry.href)} className={item}>
        <Icon className="h-4 w-4" aria-hidden="true" /> {entry.name}
      </button>
    );
  }

  const item =
    "min-h-11 w-full text-left px-3 py-2 text-sm font-semibold text-[var(--t2)] hover:bg-[var(--s2)] rounded-[var(--r2)] flex items-center gap-2";

  return (
    <div
      ref={ref}
      className={floating ? "fixed top-3 right-3 z-[60]" : "relative z-[60]"}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-11 h-11 grid place-items-center rounded-full border border-[var(--b1)] bg-[var(--s0)] text-[var(--t2)] hover:border-[var(--b3)] shadow-[var(--shadow2)]"
      >
        <CircleUserRound className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div className="absolute z-[70] top-11 right-0 w-64 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-100px)] overflow-y-auto overscroll-contain p-1.5 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] shadow-[var(--shadow)]">
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
              {menu.primary.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
              <div className="my-1 border-t border-[var(--b1)]" />
              <div className="px-3 pt-1 pb-0.5 text-[10px] font-black uppercase tracking-wider text-[var(--t4)]">
                Tools
              </div>
              {menu.tools.map((entry, index) => (
                <div key={entry.href}>
                  {entry.group !== menu.tools[index - 1]?.group && (
                    <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase text-[var(--t4)]">
                      {entry.group}
                    </div>
                  )}
                  <MenuLink entry={entry} />
                </div>
              ))}
              <div className="my-1 border-t border-[var(--b1)]" />
              {menu.secondary.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
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
