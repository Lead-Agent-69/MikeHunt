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
  Lock,
  ShieldCheck,
  MapPin,
  ScanSearch,
  Search,
  Settings,
  Store,
  Wrench,
  ArrowLeftRight,
  ChartNoAxesCombined,
  CircleUserRound,
  Grid3X3,
  ClipboardList,
  FileCheck,
  Truck,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import {
  accountMenuForMode,
  navItemForViewer,
} from "@/components/layout/nav-items";

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
  // Keep account shortcuts compact; the role-aware tool catalog lives at /tools.
  const menu = accountMenuForMode(intent?.buyerMode);
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const [open, setOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const panelId = useId();
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
    ref.current?.querySelector<HTMLAnchorElement>("a")?.focus();
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
    const onFocus = (event: FocusEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        setOpen(false);
    };
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
    };
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
      setOpen(false);
      router.replace("/login");
      router.refresh();
    } catch {
      setLogoutError("Could not log out. Check your connection and try again.");
    } finally {
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
    const viewer = navItemForViewer({ ...entry, icon: Icon }, signedOut);
    return (
      <Link
        href={viewer.href}
        title={
          viewer.signInRequired ? `Sign in to use ${entry.name}` : undefined
        }
        onClick={() => setOpen(false)}
        className={item}
      >
        <Icon className="h-4 w-4" aria-hidden="true" /> {entry.name}
        {viewer.signInRequired && (
          <>
            <Lock className="ml-auto h-3 w-3" aria-hidden="true" />
            <span className="sr-only"> (sign in required)</span>
          </>
        )}
      </Link>
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
        aria-controls={open ? panelId : undefined}
        className="w-11 h-11 grid place-items-center rounded-full border border-[var(--b1)] bg-[var(--s0)] text-[var(--t2)] hover:border-[var(--b3)] shadow-[var(--shadow2)]"
      >
        <CircleUserRound className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <nav
          id={panelId}
          aria-label="Account navigation"
          className="absolute z-[70] top-11 right-0 w-64 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-100px)] overflow-y-auto overscroll-contain p-1.5 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)] shadow-[var(--shadow)]"
        >
          <div className="px-3 py-2 text-xs font-bold text-[var(--t3)]">
            Account
          </div>
          {authLoading ? (
            <p role="status" className="px-3 py-2 text-sm">
              Checking account...
            </p>
          ) : signedOut ? (
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
              {menu.secondary.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
              <MenuLink
                entry={{ name: "Buying profile", href: "/onboarding?edit=1" }}
                icon={Settings}
              />
              <div className="my-1 border-t border-[var(--b1)]" />
              {menu.primary.map((entry) => (
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
          <MenuLink
            entry={{ name: "All tools", href: "/tools" }}
            icon={Grid3X3}
          />
          {!signedOut && !authLoading && (
            <>
              <div className="my-1 border-t border-[var(--b1)]" />
              <button
                onClick={logout}
                disabled={loggingOut}
                className={`${item} text-[var(--red)] hover:text-[var(--red)]`}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                {loggingOut ? "Logging out..." : "Log out"}
              </button>
              {logoutError && (
                <p role="alert" className="px-3 py-2 text-xs text-[var(--red)]">
                  {logoutError}
                </p>
              )}
            </>
          )}
        </nav>
      )}
    </div>
  );
}
