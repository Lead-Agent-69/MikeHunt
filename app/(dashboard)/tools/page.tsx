"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Search, Settings2 } from "lucide-react";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import {
  navItemForViewer,
  workspaceGroupsForMode,
} from "@/components/layout/nav-items";

export default function ToolsPage() {
  const { intent } = useBuyerIntent();
  const { dealerId, loading } = useDealerId();
  const [search, setSearch] = useState("");
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const term = search.trim().toLowerCase();
  const groups = workspaceGroupsForMode(intent?.buyerMode, true)
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          !["/upgrade", "/market", "/fleet", "/saved", "/settings"].includes(
            item.href,
          ) &&
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
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--t1)] md:text-3xl">
            Tools
          </h1>
          <p className="mt-1 text-sm text-[var(--t3)]">
            Research, buying and ownership tools.
          </p>
        </div>
        <Link
          href="/settings#buying-preferences"
          prefetch={false}
          aria-label="Buying preferences"
          title="Buying preferences"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--b1)] hover:bg-[var(--s2)]"
        >
          <Settings2 className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>
      <label className="flex min-h-12 items-center gap-3 rounded-full border border-[var(--b2)] bg-[var(--s1)] px-4 focus-within:outline focus-within:outline-2 focus-within:outline-[var(--accent)]">
        <Search
          className="h-5 w-5 shrink-0 text-[var(--t3)]"
          aria-hidden="true"
        />
        <input
          aria-label="Find a tool"
          placeholder="Find a tool"
          value={search}
          disabled={!ready}
          onChange={(event) => setSearch(event.target.value)}
          className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none"
        />
      </label>
      <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((group) => (
          <section
            key={group.group}
            aria-label={group.group}
            className="browse-panel p-3 sm:p-4"
          >
            <h2 className="px-2 pb-2 text-sm font-semibold text-[var(--t3)]">
              {group.group}
            </h2>
            <ul className="mt-2">
              {group.items.map((item) => {
                const entry = navItemForViewer(item, !loading && !dealerId);
                return (
                  <li key={item.href}>
                    <Link
                      href={entry.href}
                      prefetch={false}
                      className="flex min-h-12 items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold hover:bg-[var(--s1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
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
