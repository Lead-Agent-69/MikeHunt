"use client";

import React from "react";
import Link from "next/link";
import { Film, Layers, ListFilter, Map } from "lucide-react";
import { inventoryViewParams } from "@/lib/search/inventory-view-scope";

const VIEWS = [
  { path: "/scan", label: "Filters & results", Icon: ListFilter },
  { path: "/map", label: "Map", Icon: Map },
  { path: "/feed", label: "Feed", Icon: Film },
  { path: "/swipe", label: "Swipe", Icon: Layers },
];

export function InventoryViewLinks({
  query,
  current,
}: {
  query: string;
  current: string;
}) {
  const params = inventoryViewParams(new URLSearchParams(query));
  params.set("scope", "explicit");
  // Empty explicit values prevent saved defaults from silently changing a shared search.
  if (current === "/scan") {
    for (const key of [
      "state",
      "makes",
      "q",
      "lane",
      "sellerType",
      "titleType",
      "minPrice",
      "maxPrice",
      "dealers",
      "dealerSourceIds",
    ])
      if (!params.has(key))
        params.set(
          key,
          key === "state" ||
            key === "lane" ||
            key === "sellerType" ||
            key === "titleType"
            ? "all"
            : "",
        );
  }
  return (
    <nav
      aria-label="Inventory views"
      className="flex flex-wrap items-center gap-2"
    >
      {VIEWS.filter((view) => view.path !== current).map(
        ({ path, label, Icon }) => (
          <Link
            key={path}
            href={`${path}?${params.toString()}`}
            title={label}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] bg-[var(--s1)] px-3 text-xs font-semibold text-[var(--t2)]"
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </Link>
        ),
      )}
    </nav>
  );
}
