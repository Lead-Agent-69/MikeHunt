"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useWorkspace } from "@/hooks/useWorkspace";
import { workspaceGroupsForMode, navItemMatchesPath } from "./nav-items";

export function WorkspaceNav() {
  const pathname = usePathname();
  const { intent } = useBuyerIntent();
  const { expanded } = useWorkspace();
  if (
    ["/", "/market", "/discover", "/scan", "/map", "/feed", "/swipe"].includes(
      pathname,
    )
  )
    return null;
  const groups = workspaceGroupsForMode(intent?.buyerMode, expanded);
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
      className="browse-segmented mb-4 flex gap-1 overflow-x-auto p-1"
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
            prefetch={false}
            aria-current={active ? "page" : undefined}
            className={`flex min-h-11 shrink-0 items-center gap-2 rounded-full px-3 text-xs font-semibold ${active ? "text-[var(--accent)]" : "text-[var(--t3)]"}`}
          >
            {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
            {tool.name}
          </Link>
        );
      })}
    </nav>
  );
}
