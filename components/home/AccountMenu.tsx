"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, Settings } from "lucide-react";
import {
  createClientComponentClient,
  isSupabaseConfigured,
} from "@/lib/supabase";

// The account menu present on every app surface — jump to settings and LOG OUT. `floating` (default) pins
// it top-right; pass floating={false} to drop it inline into a nav bar's right side.
export function AccountMenu({ floating = true }: { floating?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    "w-full text-left px-3 py-2 text-sm font-semibold text-[var(--t2)] hover:bg-[var(--s2)] rounded-[var(--r2)] flex items-center gap-2";

  return (
    <div
      ref={ref}
      className={floating ? "fixed top-3 right-3 z-[60]" : "relative"}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Account menu"
        className="w-9 h-9 grid place-items-center rounded-full border border-[var(--b1)] bg-[var(--s0)]/90 backdrop-blur text-[var(--t2)] hover:border-[var(--b3)] shadow-[var(--shadow2)]"
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
          <button onClick={() => router.push("/settings")} className={item}>
            <Settings className="h-4 w-4" aria-hidden="true" />
            Settings
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
