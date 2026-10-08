"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { workspaceGroupsForMode, navItemMatchesPath } from "./nav-items";

export function WorkspaceNav() {
  const pathname = usePathname();
  const { intent } = useBuyerIntent();
  if (["/", "/discover", "/scan", "/map", "/feed", "/swipe"].includes(pathname))
    return null;
  const groups = workspaceGroupsForMode(intent?.buyerMode);
  const current = groups.find((group) =>
    group.items.some((item) =>
      navItemMatchesPath({ ...item, href: item.href.split("?")[0] }, pathname),
    ),
  );
  if (!current) return null;
  const peers = current.items;
  return (
    <nav
      aria-label={`${current.group} navigation`}
      className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--b1)]"
    >
      {peers.map((tool) => {
        const Icon = tool.icon;
        const active = navItemMatchesPath(
          { ...tool, href: tool.href.split("?")[0] },
          pathname,
        );
        return (
          <Link
            key={tool.href}
            href={tool.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-xs font-semibold ${active ? "border-[var(--accent)] text-[var(--t1)]" : "border-transparent text-[var(--t3)] hover:text-[var(--t1)]"}`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {tool.name}
          </Link>
        );
      })}
    </nav>
  );
}
