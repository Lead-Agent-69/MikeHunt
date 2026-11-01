"use client";

import { usePathname } from "next/navigation";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "./InventoryViewLinks";

export function DiscoveryViewAccess() {
  const path = usePathname();
  if (path !== "/discover") return null;
  return <DiscoveryViews />;
}

function DiscoveryViews() {
  const { query, ready } = useInventoryViewScope();
  if (!ready)
    return (
      <div
        className="h-12 rounded-full bg-[var(--s2)] shimmer"
        aria-label="Loading inventory views"
        role="status"
      />
    );
  return (
    <div className="min-w-0">
      <InventoryViewLinks query={query} current="/discover" />
    </div>
  );
}
