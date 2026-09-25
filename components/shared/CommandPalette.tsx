"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Ico } from "./Ico";
import { cn } from "@/lib/utils";

interface Command {
  id: string;
  label: string;
  icon: string;
  action: () => void;
  keywords?: string[];
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(0);
  const router = useRouter();

  const commands: Command[] = useMemo(() => {
    const dest: {
      id: string;
      label: string;
      icon: string;
      href: string;
      keywords?: string[];
    }[] = [
      {
        id: "discover",
        label: "Discover",
        icon: "search",
        href: "/discover",
        keywords: ["home", "deals", "feed"],
      },
      {
        id: "scan",
        label: "Scan Market",
        icon: "scan",
        href: "/scan",
        keywords: ["search", "grid", "filter"],
      },
      {
        id: "check",
        label: "Deal Check",
        icon: "calculator",
        href: "/deal-check",
        keywords: ["analyze", "fees", "vin"],
      },
      {
        id: "map",
        label: "Deal Map",
        icon: "map",
        href: "/map",
        keywords: ["location", "near", "geo"],
      },
      {
        id: "insights",
        label: "Intel & ROI",
        icon: "trending-up",
        href: "/insights",
        keywords: ["intelligence", "outcomes", "calibration", "roi"],
      },
      {
        id: "auctions",
        label: "Auctions",
        icon: "list",
        href: "/auctions",
        keywords: ["auction", "runlist", "copart"],
      },
      {
        id: "lane",
        label: "Lane Scanner",
        icon: "scan",
        href: "/lane",
        keywords: ["auction", "lane", "barcode", "vin", "scanner", "camera"],
      },
      {
        id: "fleet",
        label: "Fleet",
        icon: "fleet",
        href: "/fleet",
        keywords: ["inventory", "pipeline", "recon"],
      },
      {
        id: "searches",
        label: "Saved Searches",
        icon: "bell",
        href: "/searches",
        keywords: ["alerts", "watch"],
      },
      {
        id: "saved",
        label: "Saved Vehicles",
        icon: "car",
        href: "/saved",
        keywords: ["watchlist", "bookmarks"],
      },
      {
        id: "alerts",
        label: "Alerts",
        icon: "bell",
        href: "/alerts",
        keywords: ["notifications", "matches"],
      },
      {
        id: "settings",
        label: "Settings",
        icon: "settings",
        href: "/settings",
        keywords: ["preferences", "profile"],
      },
    ];
    return dest.map((d) => ({
      id: d.id,
      label: d.label,
      icon: d.icon,
      keywords: d.keywords,
      action: () => router.push(d.href),
    }));
  }, [router]);

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
    if (q.length < 2) {
      setDealResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/scan?q=${encodeURIComponent(q)}&sort=profit`,
        );
        const data = await res.json();
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
              icon: "car",
              action: () => router.push(`/deal/${v.id}`),
            };
          });
        setDealResults(items);
      } catch {
        setDealResults([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [search, router]);

  // The full navigable list = matching nav commands, then live deal results.
  const allItems = useMemo(
    () => [...filteredCommands, ...dealResults],
    [filteredCommands, dealResults],
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
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
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] animate-fadeIn"
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
          <kbd className="px-2 py-1 text-xs bg-[var(--s2)] border border-[var(--b1)] rounded">
            ESC
          </kbd>
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
                  <Ico
                    name={cmd.icon as any}
                    size={20}
                    className="text-[var(--t2)]"
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
    </div>
  );
}
