"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { accountMenuForMode, MORE_GROUPS } from "./nav-items";

export function WorkspaceNav() {
  const pathname = usePathname();
  const { intent } = useBuyerIntent();
  if (pathname === "/discover" || pathname === "/") return null;
  const tools = accountMenuForMode(intent?.buyerMode).tools;
  const current = tools.find((tool) => {
    const base = tool.href.split("?")[0];
    return pathname === base || pathname.startsWith(`${base}/`);
  });
  if (!current) return null;
  const peers = tools.filter((tool) => tool.group === current.group);
  const catalog = MORE_GROUPS.flatMap((group) => group.items);
  return (
    <nav
      aria-label={`${current.group} desks`}
      className="mb-4 flex gap-1 overflow-x-auto border-b border-[var(--b1)]"
    >
      {peers.map((tool) => {
        const Icon = catalog.find(
          (item) => item.href === tool.href.split("?")[0],
        )?.icon;
        const active = tool === current;
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
