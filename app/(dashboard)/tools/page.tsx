"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, Settings2 } from "lucide-react";
import { useBuyerIntent, BUYER_MODES } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import { useWorkspace } from "@/hooks/useWorkspace";
import {
  navItemForViewer,
  workspaceGroupsForMode,
} from "@/components/layout/nav-items";

export default function ToolsPage() {
  const { intent } = useBuyerIntent();
  const { dealerId, loading } = useDealerId();
  const { expanded } = useWorkspace();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const groups = workspaceGroupsForMode(intent?.buyerMode, expanded || !!term)
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        `${item.name} ${group.group} ${item.description || ""}`
          .toLowerCase()
          .includes(term),
      ),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6 pb-28">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--t1)]">Tools</h1>
          <p className="mt-1 text-sm text-[var(--t3)]">
            {BUYER_MODES[intent?.buyerMode || "personal"].label}
          </p>
        </div>
        <Link
          href="/onboarding?edit=1"
          aria-label="Edit buying profile"
          title="Edit buying profile"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)] hover:bg-[var(--s2)]"
        >
          <Settings2 className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] pb-3 text-sm">
        <span className="text-[var(--t3)]">
          {expanded ? "Expanded workspace" : "Focused workspace"}
        </span>
        <Link
          href="/upgrade"
          className="inline-flex min-h-11 items-center gap-2 font-semibold text-[var(--blue)]"
        >
          <Settings2 className="h-4 w-4" aria-hidden="true" />
          {expanded ? "Workspace options" : "Free workspace upgrade"}
        </Link>
      </div>
      <label className="flex min-h-11 items-center gap-3 border-b border-[var(--b2)] px-2">
        <Search
          className="h-5 w-5 shrink-0 text-[var(--t3)]"
          aria-hidden="true"
        />
        <input
          aria-label="Find a tool"
          placeholder="Find a tool"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"
        />
      </label>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section key={group.group} aria-label={group.group}>
            <h2 className="border-b border-[var(--b1)] pb-2 text-xs font-bold uppercase text-[var(--t3)]">
              {group.group}
            </h2>
            <ul className="mt-2">
              {group.items.map((item) => {
                const entry = navItemForViewer(item, !loading && !dealerId);
                return (
                  <li key={item.href}>
                    <Link
                      href={entry.href}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm font-semibold hover:bg-[var(--s2)]"
                    >
                      <item.icon
                        className="h-4 w-4 shrink-0 text-[var(--t3)]"
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 break-words">
                        <span className="block">{entry.name}</span>
                        {entry.description && (
                          <span className="mt-1 block text-xs font-normal text-[var(--t3)]">
                            {entry.description}
                          </span>
                        )}
                      </span>
                      <ArrowUpRight
                        className="h-4 w-4 shrink-0 text-[var(--t4)]"
                        aria-hidden="true"
                      />
                      {entry.signInRequired && (
                        <span className="sr-only">(sign in required)</span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
      {groups.length === 0 && (
        <p role="status" className="py-6 text-sm text-[var(--t3)]">
          No tools match this search.
        </p>
      )}
    </div>
  );
}
