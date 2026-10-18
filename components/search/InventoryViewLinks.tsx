"use client";

import React from "react";
import Link from "next/link";
import { Film, Layers, ListFilter, Map, ArrowRight } from "lucide-react";
import { INVENTORY_DETAIL_FIELDS } from "@/lib/search/extended-inventory-filters";
import { inventoryViewParams } from "@/lib/search/inventory-view-scope";
import { MAX_RADIUS_MI } from "@/lib/search/zip-radius-scope";

const VIEWS = [
  { path: "/market", label: "Results", Icon: ListFilter },
  { path: "/map", label: "Map", Icon: Map },
  { path: "/feed", label: "Feed", Icon: Film },
  { path: "/swipe", label: "Swipe", Icon: Layers },
];

export function InventoryViewNotice({
  title,
  query,
  message,
}: {
  title: string;
  query: string;
  message: string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-4 py-6">
      <h1 className="text-xl font-bold">{title}</h1>
      <section
        role="status"
        className="space-y-4 border-y border-[var(--b1)] py-6"
      >
        <p className="text-sm text-[var(--t2)]">{message}</p>
        <Link
          href={`/market?${query}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--blue)] px-4 text-sm font-semibold text-white"
        >
          <ListFilter className="h-4 w-4" aria-hidden="true" />
          Open Results
        </Link>
      </section>
    </div>
  );
}

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
  const wideRadius =
    !!params.get("zip") && Number(params.get("radius")) > MAX_RADIUS_MI;
  const unavailable = (path: string) =>
    path !== "/market" &&
    (wideRadius ||
      (params.get("hasPhotos") === "no" && ["/feed", "/swipe"].includes(path)));
  params.set("scope", "explicit");
  // Empty explicit values prevent saved defaults from silently changing a shared search.
  if (current === "/market") {
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
            aria-disabled={unavailable(path) ? true : undefined}
            tabIndex={unavailable(path) ? -1 : undefined}
            onClick={(event) => {
              if (unavailable(path)) event.preventDefault();
            }}
            title={label}
            aria-current={path === current ? "page" : undefined}
            className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border px-1 py-1.5 text-[11px] font-semibold sm:gap-2 sm:px-3 sm:text-xs ${path === current ? "border-[var(--blue)] bg-[var(--s2)] text-[var(--blue)]" : "border-[var(--b1)] bg-[var(--s1)] text-[var(--t2)]"}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
      {wideRadius && (
        <p role="status" className="w-full text-xs text-[var(--t2)]">
          Map, Feed and Swipe support up to {MAX_RADIUS_MI} miles. Your wider
          search stays available in Results.
        </p>
      )}
      {params.get("hasPhotos") === "no" && (
        <p role="status" className="w-full text-xs text-[var(--t2)]">
          Listings without photos are available in Results and Map. Feed and
          Swipe require photos.
        </p>
      )}
      {["7", "30"].includes(params.get("seenWithin") || "") && (
        <p role="status" className="w-full text-xs text-[var(--t2)]">
          Includes older observations. Confirm current price and availability
          with the seller.
        </p>
      )}
      {current !== "/discover" && (
        <form
          action={current === "/discover" ? "/market" : current}
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
            className="min-h-11 w-28 min-w-0 rounded-lg border border-[var(--b1)] bg-[var(--s1)] px-2 text-xs text-[var(--t1)] sm:w-auto"
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
      )}
      {children}
      {params.get("body") && params.get("body") !== "all" && (
        <div className="flex w-full flex-wrap items-center gap-2 text-xs text-[var(--t2)]">
          <p>Body style is not reported for every listing.</p>
          <form
            action={current === "/discover" ? "/market" : current}
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
