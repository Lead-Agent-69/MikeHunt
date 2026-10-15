"use client";

import { use, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Star,
} from "lucide-react";
import { useDealerWatch } from "@/hooks/useDealerWatch";
import { DealCard, DealCardSkeleton } from "@/components/shared/DealCard";

const PAGE_SIZE = 48;
const fetcher = async (url: string) => {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data?.error || data?.degraded)
    throw new Error("Dealer inventory unavailable");
  if (
    url.startsWith("/api/scan?") &&
    (!Array.isArray(data?.vehicles) ||
      !Number.isSafeInteger(data?.total) ||
      data.total < 0 ||
      typeof data?.hasMore !== "boolean")
  )
    throw new Error("Dealer inventory unavailable");
  return data;
};

export function DealerStorefrontContent({ host }: { host: string }) {
  const [page, setPage] = useState(0);
  const heading = useRef<HTMLElement>(null);
  const changePage = (next: number) => {
    setPage(next);
    heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
  };
  const { data: net } = useSWR("/api/dealer-network", fetcher, {
    revalidateOnFocus: false,
  });
  const dealer = net?.dealers?.find((item: any) => item.host === host);
  const { data, error, isLoading, mutate } = useSWR(
    `/api/scan?dealer=${encodeURIComponent(host)}&page=${page}&pageSize=${PAGE_SIZE}&sort=newest`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const watch = useDealerWatch();
  const watching = watch.has(host);
  const cars = Array.isArray(data?.vehicles) ? data.vehicles : [];
  const total = typeof data?.total === "number" ? data.total : null;
  const pageCount =
    total == null ? null : Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-5 pb-24 md:pb-8">
      <Link
        href="/dealer-network"
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--t3)]"
      >
        <ArrowLeft size={16} aria-hidden="true" /> Dealer network
      </Link>
      <header
        ref={heading}
        className="scroll-mt-20 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] pb-4"
      >
        <div className="min-w-0">
          <h1 className="break-words text-xl font-bold text-[var(--t1)]">
            {dealer?.name || host}
          </h1>
          <p role="status" className="mt-1 text-sm text-[var(--t3)]">
            {isLoading
              ? "Checking dealer inventory..."
              : error
                ? "Inventory temporarily unavailable"
                : total == null
                  ? "Inventory count unavailable"
                  : `${total.toLocaleString()} matching listings`}
            {dealer?.state ? ` - ${dealer.state}` : ""}
          </p>
          <p className="mt-1 text-xs text-[var(--t4)]">
            Stored listings; confirm price, title, condition and availability
            with the seller.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => watch.toggle(host)}
            aria-pressed={watching}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--b2)] px-3 text-sm font-semibold text-[var(--t2)]"
          >
            <Star
              size={16}
              fill={watching ? "currentColor" : "none"}
              aria-hidden="true"
            />{" "}
            {watching ? "Watching" : "Watch"}
          </button>
          <a
            href={dealer?.url || `https://${host}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[var(--b2)] px-3 text-sm font-semibold text-[var(--blue)]"
          >
            Visit site <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <DealCardSkeleton key={index} />
          ))}
        </div>
      ) : error ? (
        <div role="alert" className="py-8 text-sm text-[var(--t3)]">
          <p>
            We couldn't load this dealer's listings. This doesn't mean its
            inventory is empty.
          </p>
          <button
            type="button"
            onClick={() => void mutate().catch(() => {})}
            className="mt-3 min-h-11 font-semibold text-[var(--blue)]"
          >
            Try again
          </button>
        </div>
      ) : cars.length === 0 ? (
        <p className="py-8 text-sm text-[var(--t3)]">
          No matching listings on this page. Check the dealer's original
          inventory for current availability.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cars.map((car: any) => (
            <DealCard
              key={car.id}
              {...car}
              requirePhoto
              imageUrls={car.images}
              flipDesk={data?.deskAccess === "flip"}
            />
          ))}
        </div>
      )}
      <nav
        aria-label="Dealer inventory pages"
        className="flex items-center justify-between gap-3 border-t border-[var(--b1)] pt-4"
      >
        <button
          type="button"
          disabled={page === 0 || isLoading}
          onClick={() => changePage(Math.max(0, page - 1))}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--t2)] disabled:opacity-40"
        >
          <ChevronLeft size={18} aria-hidden="true" /> Previous
        </button>
        <span className="text-xs text-[var(--t3)]">
          Page {page + 1}
          {pageCount && !error && !isLoading ? ` of ${pageCount}` : ""}
        </span>
        <button
          type="button"
          disabled={isLoading || Boolean(error) || !data?.hasMore}
          onClick={() => changePage(page + 1)}
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--t2)] disabled:opacity-40"
        >
          Next <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}

export default function DealerStorefront({
  params,
}: {
  params: Promise<{ host: string }>;
}) {
  const { host } = use(params);
  return <DealerStorefrontContent key={host} host={host} />;
}
