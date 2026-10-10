"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Ico } from "./Ico";
import { cn } from "@/lib/utils";
import { CarFront, Grid3X3, X, type LucideIcon } from "lucide-react";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  navItemForViewer,
  scanHrefForMode,
  workspaceGroupsForMode,
} from "@/components/layout/nav-items";

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const { intent } = useBuyerIntent();
  const { dealerId, loading } = useDealerId();
  const { expanded } = useWorkspace();

  const commands: Command[] = useMemo(() => {
    const groups = workspaceGroupsForMode(
      intent?.buyerMode,
      expanded || !!search.trim(),
    );
    return [
      {
        id: "/tools",
        label: "All tools",
        icon: Grid3X3,
        action: () => router.push("/tools"),
      },
      ...groups.flatMap((group) =>
        group.items.map((item) => {
          const entry = navItemForViewer(item, !loading && !dealerId);
          return {
            id: item.href,
            label: `${item.name}${entry.signInRequired ? " (sign in required)" : ""}`,
            icon: item.icon,
            keywords: [
              group.group.toLowerCase(),
              item.href,
              item.description?.toLowerCase() || "",
            ],
            action: () => router.push(entry.href),
          };
        }),
      ),
    ];
  }, [router, intent?.buyerMode, dealerId, loading, expanded, search]);

  const filteredCommands = useMemo(() => {
    if (!search) return commands;
    const query = search.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(query) ||
        cmd.keywords?.some((k) => k.includes(query)),
    );
  }, [commands, search]);

  // LIVE inventory search — type a make/model/city and jump straight to the actual deal (the modern-app
  // palette, not just nav). Debounced; hits the same /api/scan the Scan page uses.
  const [dealResults, setDealResults] = useState<Command[]>([]);
  useEffect(() => {
    const q = search.trim();
    if (!open || q.length < 2) {
      setDealResults([]);
      return;
    }
    const controller = new AbortController();
    setDealResults([]);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `${scanHrefForMode(intent?.buyerMode).replace("/scan", "/api/scan")}&q=${encodeURIComponent(q)}`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error("Search unavailable");
        const data = await res.json();
        if (controller.signal.aborted) return;
        const items: Command[] = (data.vehicles || data.deals || [])
          .slice(0, 6)
          .map((v: any) => {
            const label = `${v.year || ""} ${v.make || ""} ${v.model || ""}`
              .replace(/\s+/g, " ")
              .trim();
            const money = v.askPrice
              ? `$${Math.round(v.askPrice).toLocaleString()}`
              : "";
            return {
              id: `deal-${v.id}`,
              label:
                [label, money, v.locationState].filter(Boolean).join(" · ") ||
                "Deal",
              icon: CarFront,
              action: () => router.push(`/deal/${v.id}`),
            };
          });
        setDealResults(items);
      } catch {
        if (!controller.signal.aborted) setDealResults([]);
      }
    }, 250);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [search, router, open, intent?.buyerMode]);

  // The full navigable list = matching nav commands, then live deal results.
  const allItems = useMemo(
    () => [...filteredCommands, ...dealResults],
    [filteredCommands, dealResults],
  );

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      returnFocus.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (!open) returnFocus.current = document.activeElement as HTMLElement;
        setOpen((prev) => !prev);
        setSearch("");
        setSelected(0);
      }

      if (!open) return;

      if (e.key === "Escape") {
        setOpen(false);
        setSearch("");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((prev) => (prev + 1) % Math.max(1, allItems.length));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected(
          (prev) => (prev - 1 + allItems.length) % Math.max(1, allItems.length),
        );
      } else if (e.key === "Enter") {
        e.preventDefault();
        allItems[selected]?.action();
        setOpen(false);
        setSearch("");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, selected, allItems]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Search tools and vehicles"
      onCancel={(event) => {
        event.preventDefault();
        setOpen(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-none max-w-none border-0 flex items-start justify-center pt-[12vh] animate-fadeIn"
      style={{ background: "rgba(36,28,43,0.4)" }}
    >
      <div
        className="w-full max-w-2xl mx-4 glass-panel overflow-hidden animate-popIn"
        style={{ boxShadow: "var(--shadow3)" }}
      >
        {/* Search Input */}
        <div className="flex items-center gap-3 p-4 border-b border-[var(--b1)]">
          <Ico name="search" className="text-[var(--t3)]" size={20} />
          <input
            aria-label="Search tools and vehicles"
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setSelected(0);
            }}
            placeholder="Search deals (make, model, city) or jump anywhere…"
            className="flex-1 bg-transparent border-none outline-none text-base text-[var(--t1)] placeholder:text-[var(--t3)]"
            autoFocus
          />
          <button
            type="button"
            aria-label="Close search"
            title="Close search"
            onClick={() => setOpen(false)}
            className="grid min-h-11 min-w-11 place-items-center text-[var(--t3)] hover:bg-[var(--s2)]"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Commands + live deal results */}
        <div className="max-h-96 overflow-y-auto">
          {allItems.length === 0 ? (
            <div className="p-8 text-center text-[var(--t3)]">
              {search.trim().length >= 2 ? "No matches" : "No commands found"}
            </div>
          ) : (
            allItems.map((cmd, idx) => (
              <div key={cmd.id}>
                {/* Section label before the first live deal result. */}
                {idx === filteredCommands.length && dealResults.length > 0 && (
                  <div className="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-[var(--t4)]">
                    Deals
                  </div>
                )}
                <button
                  onClick={() => {
                    cmd.action();
                    setOpen(false);
                    setSearch("");
                  }}
                  className={cn(
                    "w-full flex items-center gap-3 p-3 text-left transition-colors",
                    idx === selected
                      ? "border-l-2 border-[var(--amber)]"
                      : "hover:bg-[var(--s1)] border-l-2 border-transparent",
                  )}
                  style={
                    idx === selected
                      ? { background: "var(--amber-lo)" }
                      : undefined
                  }
                >
                  <cmd.icon
                    className="h-5 w-5 text-[var(--t2)]"
                    aria-hidden="true"
                  />
                  <span className="flex-1 text-sm font-medium text-[var(--t1)]">
                    {cmd.label}
                  </span>
                  {idx === selected && (
                    <kbd className="px-2 py-1 text-xs bg-[var(--s2)] border border-[var(--b1)] rounded">
                      ↵
                    </kbd>
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-3 border-t border-[var(--b1)] bg-[var(--s1)] text-xs text-[var(--t3)]">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--s2)] border border-[var(--b1)] rounded">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-[var(--s2)] border border-[var(--b1)] rounded">
                ↓
              </kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-[var(--s2)] border border-[var(--b1)] rounded">
                ↵
              </kbd>
              Select
            </span>
          </div>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-[var(--s2)] border border-[var(--b1)] rounded">
              ⌘K
            </kbd>
            Toggle
          </span>
        </div>
      </div>
    </dialog>
  );
}
