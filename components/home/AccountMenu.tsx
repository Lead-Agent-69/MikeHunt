"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  Bookmark,
  CircleHelp,
  Gavel,
  LogIn,
  LogOut,
  ScanSearch,
  Search,
  Settings,
  Store,
  Wrench,
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
  "/dealer-network": Store,
  "/lane": Gavel,
  "/settings": Settings,
  "/changelog": CircleHelp,
};

function menuIcon(href: string): LucideIcon {
  return MENU_ICONS[href.split("?")[0]] ?? ScanSearch;
}

// The account menu present on every app surface — jump to settings and LOG OUT. `floating` (default) pins
// it top-right; pass floating={false} to drop it inline into a nav bar's right side.
export function AccountMenu({ floating = true }: { floating?: boolean }) {
  const router = useRouter();
  const { intent } = useBuyerIntent();
  // Entries come from accountMenuForMode: flip tools (Dealer network, Auction Lane) only on a
  // reseller or dealer desk, Parts for parts/DIY/flip, and no admin entry for anyone.
  const menu = accountMenuForMode(intent?.buyerMode);
  const { dealerId, loading: authLoading } = useDealerId();
  const signedOut = !authLoading && !dealerId;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
    try {
      if (isSupabaseConfigured()) {
        await createClientComponentClient().auth.signOut();
      } else {
        window.location.assign("/api/auth/demo-logout?next=/login");
        return;
      }
    } catch {
      /* best-effort */
    }
    router.push("/login");
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
      className={floating ? "fixed top-3 right-3 z-[60]" : "relative"}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        aria-expanded={open}
        className="w-11 h-11 grid place-items-center rounded-full border border-[var(--b1)] bg-[var(--s0)]/90 backdrop-blur text-[var(--t2)] hover:border-[var(--b3)] shadow-[var(--shadow2)]"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-1a7 7 0 0 1 14 0v1" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-11 right-0 w-52 p-1.5 rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)]/95 backdrop-blur-md shadow-[var(--shadow)]">
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
              {menu.tools.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
              <div className="my-1 border-t border-[var(--b1)]" />
              {menu.secondary.map((entry) => (
                <MenuLink key={entry.href} entry={entry} />
              ))}
            </>
          )}
          {!signedOut && (
            <>
              <div className="my-1 border-t border-[var(--b1)]" />
              <button
                onClick={logout}
                className={`${item} text-[var(--red)] hover:text-[var(--red)]`}
              >
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Log out
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
