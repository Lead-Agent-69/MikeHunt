"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Gavel, CircleHelp, LogOut, Settings } from "lucide-react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { hidesFlipNav } from "@/components/layout/nav-items";

// The account menu present on every app surface — jump to settings and LOG OUT. `floating` (default) pins
// it top-right; pass floating={false} to drop it inline into a nav bar's right side.
export function AccountMenu({ floating = true }: { floating?: boolean }) {
  const router = useRouter();
  const { intent } = useBuyerIntent();
  // Auction Lane is a flip tool. Personal, DIY, and parts desks don't get it here either.
  const showAuctionLane = !hidesFlipNav(intent?.buyerMode);
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
          <button
            onClick={() => {
              setOpen(false);
              router.push("/alerts");
            }}
            className={item}
          >
            <Bell className="h-4 w-4" aria-hidden="true" /> Activity
          </button>
          {showAuctionLane && (
            <button
              onClick={() => {
                setOpen(false);
                router.push("/lane");
              }}
              className={`${item} md:hidden`}
            >
              <Gavel className="h-4 w-4" aria-hidden="true" /> Auction Lane
            </button>
          )}
          <button
            onClick={() => {
              setOpen(false);
              router.push("/settings");
            }}
            className={item}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
          </button>
          <button
            onClick={() => {
              setOpen(false);
              router.push("/changelog");
            }}
            className={item}
          >
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
            Help &amp; updates
          </button>
          <div className="my-1 border-t border-[var(--b1)]" />
          <button
            onClick={logout}
            className={`${item} text-[var(--red)] hover:text-[var(--red)]`}
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
