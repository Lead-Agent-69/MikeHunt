"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
} from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import { reportedPrice } from "@/lib/deals/reported-price";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import { vehicleLocation } from "@/lib/search/vehicle-location";
import type { MarketListing } from "@/lib/market/explorer";
import { useDiscoverySave } from "@/components/discovery/DiscoverySaveProvider";
import { PhotoPreview } from "@/components/shared/PhotoPreview";

export function MarketListingCard({
  row,
  flipDesk,
}: {
  row: MarketListing;
  flipDesk: boolean;
}) {
  const [photo, setPhoto] = useState(0);
  const [failed, setFailed] = useState<string[]>([]);
  const [preview, setPreview] = useState<number | null>(null);
  const photos = (row.images || []).filter((url) => !failed.includes(url));
  const index = photo % Math.max(photos.length, 1);
  const vendor = vendorIdentity(row.source, row.sourceUrl);
  const saved = useDiscoverySave({
    ...row,
    grade: "unknown",
    gradeLabel: "",
    discountPct: 0,
    alsoOn: [],
    listingCount: 1,
    lane: undefined,
    trueNetProfit: row.profitEstimate,
  });
  const seen = row.lastSeenAt ? Date.parse(row.lastSeenAt) : NaN;
  const hours =
    Number.isFinite(seen) && seen <= Date.now() + 300000
      ? Math.max(0, Math.floor((Date.now() - seen) / 3600000))
      : null;
  const freshness =
    hours == null
      ? "Seen time not reported"
      : hours < 1
        ? "Seen within 1h"
        : hours < 24
          ? `Seen ${hours}h ago`
          : `Seen ${Math.floor(hours / 24)}d ago`;
  const price = row.price;
  return (
    <article className="min-w-0 overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s1)] shadow-sm">
      <div className="relative aspect-[16/10] overflow-hidden bg-[var(--s2)]">
        {photos.length ? (
          <button
            type="button"
            aria-label={`View photos of ${row.title}`}
            onClick={() => setPreview(index)}
            className="h-full w-full"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedImage(photos[index])}
              alt={row.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
              onError={() => setFailed((all) => [...all, photos[index]])}
            />
          </button>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--t3)]">
            <Camera className="h-8 w-8" aria-hidden="true" />
            <span className="text-xs">Source photo unavailable</span>
            {vendor.href && (
              <a
                href={vendor.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline"
              >
                Check source photos
              </a>
            )}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-md bg-black/75 px-2 py-1 text-[10px] font-bold text-white">
          {vendor.label}
        </span>
        <button
          type="button"
          disabled={saved.busy}
          aria-pressed={saved.saved}
          aria-label={`${saved.label}: ${row.title}`}
          onClick={() => void saved.toggle()}
          className="absolute right-2 top-2 grid h-11 w-11 place-items-center rounded-full bg-black/65 text-white disabled:opacity-50"
        >
          <Bookmark
            className="h-5 w-5"
            fill={saved.saved ? "currentColor" : "none"}
          />
        </button>
        {photos.length > 1 && (
          <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/75 text-white">
            <button
              type="button"
              aria-label={`Previous photo of ${row.title}`}
              className="grid h-11 w-11 place-items-center"
              onClick={() =>
                setPhoto((index + photos.length - 1) % photos.length)
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[10px]">
              {index + 1}/{photos.length}
            </span>
            <button
              type="button"
              aria-label={`Next photo of ${row.title}`}
              className="grid h-11 w-11 place-items-center"
              onClick={() => setPhoto((index + 1) % photos.length)}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--t3)]">
            {row.sellerType ||
              row.lane?.replace(/-/g, " ") ||
              "Seller type unreported"}
          </p>
          <h3 className="mt-1 text-base font-bold leading-snug">
            <Link href={`/deal/${row.id}`} className="hover:underline">
              {row.year} {row.make} {row.model}
            </Link>
          </h3>
          {row.trim && <p className="text-xs text-[var(--t3)]">{row.trim}</p>}
        </div>
        <div className="flex flex-wrap items-end justify-between gap-2 border-y border-[var(--b1)] py-3">
          <div>
            <p className="text-[10px] font-semibold text-[var(--t3)]">
              {price?.label || "Unverified advertised amount"}
            </p>
            <p className="text-xl font-extrabold tabular-nums">
              {reportedPrice(price?.amount)}
            </p>
          </div>
          {price?.buyNowPrice != null && price.kind !== "buy_now" && (
            <div className="text-right">
              <p className="text-[10px] text-[var(--t3)]">Buy now</p>
              <p className="text-sm font-bold tabular-nums">
                {reportedPrice(price.buyNowPrice)}
              </p>
            </div>
          )}
        </div>
        {price?.advertisedAmount != null &&
          price.amount !== price.advertisedAmount && (
            <p className="text-[11px] text-[var(--t3)]">
              Source headline: {reportedPrice(price.advertisedAmount)} · differs
              from the disclosed full price.
            </p>
          )}
        {price && !["asking", "buy_now"].includes(price.kind) && (
          <p className="text-[11px] text-[var(--t3)]">
            {price.kind === "current_bid"
              ? "Bidding is open; final purchase amount and fees can change."
              : "Full purchase price needs confirmation at the source."}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
          <div>
            <dt className="text-[var(--t3)]">Mileage</dt>
            <dd className="font-semibold">
              {row.mileage != null && row.mileage >= 0
                ? `${row.mileage.toLocaleString()} mi`
                : "Not reported"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--t3)]">Title / condition</dt>
            <dd className="font-semibold capitalize">
              {row.condition?.replace(/_/g, " ") || "Not reported"}
            </dd>
          </div>
          {row.damageType && (
            <div>
              <dt className="text-[var(--t3)]">Reported damage</dt>
              <dd className="capitalize">
                {row.damageType.replace(/_/g, " ")}
              </dd>
            </div>
          )}
          {row.auctionEndAt && (
            <div>
              <dt className="text-[var(--t3)]">Auction ends</dt>
              <dd>
                {new Date(row.auctionEndAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </dd>
            </div>
          )}
        </dl>
        {flipDesk && row.sellEstimate != null && (
          <p className="text-xs text-[var(--t3)]">
            Estimated resale:{" "}
            <span className="font-semibold">
              {reportedPrice(row.sellEstimate)}
            </span>{" "}
            · model estimate
          </p>
        )}
        <p className="flex flex-wrap items-center gap-1 text-xs text-[var(--t3)]">
          <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
          {vehicleLocation(row.locationCity, row.locationState)}
          {row.distanceMiles != null && (
            <span> · ~{Math.round(row.distanceMiles).toLocaleString()} mi</span>
          )}
        </p>
        <p className="text-[10px] text-[var(--t3)]" title={row.lastSeenAt}>
          {freshness}
          {row.vin ? ` · VIN …${row.vin.slice(-6)}` : " · VIN not reported"}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--b1)] pt-2">
          <Link
            href={`/deal/${row.id}`}
            className="inline-flex min-h-11 items-center text-xs font-bold text-[var(--blue)]"
          >
            Review listing →
          </Link>
          {vendor.href && (
            <a
              href={vendor.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${vendor.label} listing in a new tab`}
              className="inline-flex min-h-11 items-center gap-1 text-xs font-semibold"
            >
              Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <PhotoPreview
        images={photos.map((src) => ({
          src: proxiedImage(src),
          alt: row.title,
        }))}
        selectedIndex={preview}
        onSelect={setPreview}
      />
    </article>
  );
}
