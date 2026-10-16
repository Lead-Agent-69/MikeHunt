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
        className="mb-2 h-11 bg-[var(--s2)] shimmer"
        aria-label="Loading inventory views"
        role="status"
      />
    );
  return (
    <div className="mb-2 border-b border-[var(--b1)] pb-3">
      <div>
        <InventoryViewLinks query={query} current="/discover" />
      </div>
    </div>
  );
}
