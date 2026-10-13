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
    <details className="mb-2 border-b border-[var(--b1)] pb-1">
      <summary className="min-h-11 cursor-pointer content-center text-sm font-semibold text-[var(--t2)]">
        Inventory views
      </summary>
      <div className="pt-3">
        <InventoryViewLinks query={query} current="/discover" />
      </div>
    </details>
  );
}
