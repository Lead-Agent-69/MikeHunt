"use client";

import React from "react";
import Link from "next/link";
import { Film, Layers, ListFilter, Map, ArrowRight } from "lucide-react";
import { INVENTORY_DETAIL_FIELDS } from "@/lib/search/extended-inventory-filters";
import { inventoryViewParams } from "@/lib/search/inventory-view-scope";

const VIEWS = [
  { path: "/scan", label: "Results", Icon: ListFilter },
  { path: "/map", label: "Map", Icon: Map },
  { path: "/feed", label: "Feed", Icon: Film },
  { path: "/swipe", label: "Swipe", Icon: Layers },
];

export function InventoryViewLinks({
  query,
  current,
  disabled = false,
  children,
}: {
  query: string;
  current: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  if (disabled)
    return (
      <div
        role="status"
        aria-label="Loading inventory views"
        aria-busy="true"
        className="h-[104px] w-full rounded-lg bg-[var(--s2)] shimmer sm:h-11"
      />
    );
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
    <div className="flex flex-wrap items-center gap-3">
      <nav
        aria-label="Inventory views"
        className="grid w-full grid-cols-4 gap-1 sm:flex sm:w-auto sm:flex-wrap"
      >
        {VIEWS.map(({ path, label, Icon }) => (
          <Link
            key={path}
            href={`${path}?${params.toString()}`}
            prefetch={false}
            title={label}
            aria-current={path === current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold sm:gap-2 sm:px-3 ${path === current ? "border-[var(--blue)] bg-[var(--s2)] text-[var(--blue)]" : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t2)]"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
      <form
        action={current === "/discover" ? "/scan" : current}
        method="get"
        className="flex min-w-0 items-center gap-1"
      >
        {Array.from(params.entries())
          .filter(([key]) => key !== "body")
          .map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}
        <select
          key={params.get("body") || "all"}
          name="body"
          aria-label="Shop by body style"
          defaultValue={params.get("body") || ""}
          className="min-h-11 min-w-0 rounded-lg border border-[var(--b1)] bg-[var(--s1)] px-2 text-xs text-[var(--t1)]"
        >
          <option value="">All body styles</option>
          {INVENTORY_DETAIL_FIELDS.find(
            (field) => field.key === "body",
          )?.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="submit"
          title="Apply body style"
          aria-label="Apply body style"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)] text-[var(--blue)]"
        >
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
      {children}
      {params.get("body") && params.get("body") !== "all" && (
        <div className="flex w-full flex-wrap items-center gap-2 text-xs text-[var(--t2)]">
          <p>Body style is not reported for every listing.</p>
          <form
            action={current === "/discover" ? "/scan" : current}
            method="get"
          >
            {Array.from(params.entries())
              .filter(([key]) => key !== "body")
              .map(([key, value]) => (
                <input key={key} type="hidden" name={key} value={value} />
              ))}
            <input type="hidden" name="body" value="" />
            <button
              type="submit"
              className="min-h-11 px-2 font-semibold text-[var(--blue)]"
            >
              All body styles
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
