"use client";

import {
  type MouseEvent as ReactMouseEvent,
  useEffect,
  useRef,
  useState,
  memo,
} from "react";
import Link from "next/link";
import {
  Bookmark,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  MapPin,
  ZoomIn,
} from "lucide-react";
import { proxiedImage } from "@/lib/image-url";
import { reportedPrice } from "@/lib/deals/reported-price";
import { vendorIdentity } from "@/lib/sources/vendor-identity";
import { vehicleLocation } from "@/lib/search/vehicle-location";
import type { MarketListing } from "@/lib/market/explorer";
import { useDiscoverySave } from "@/components/discovery/DiscoverySaveProvider";
import { PhotoPreview } from "@/components/shared/PhotoPreview";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { usePhotoNavigation } from "@/hooks/usePhotoNavigation";
import { rememberMarketPosition } from "./MarketReturnPosition";
import { bidStatusNote } from "@/lib/deals/price-observation";
import { listingFreshnessLabel } from "@/lib/deals/listing-freshness";
import {
  titleBadgeModel,
  TITLE_DAMAGE_LABELS,
} from "@/lib/deals/title-badge-model";

export const MarketListingCard = memo(function MarketListingCard(props: {
  row: MarketListing;
  flipDesk: boolean;
  onPhotosUnavailable?: (id: string) => void;
}) {
  return (
    <ListingCard
      key={`${props.row.id}:${JSON.stringify(props.row.images || [])}`}
      {...props}
    />
  );
});

function ListingCard({
  row,
  flipDesk,
  onPhotosUnavailable,
}: {
  row: MarketListing;
  flipDesk: boolean;
  onPhotosUnavailable?: (id: string) => void;
}) {
  const gallery = useListingPhotos(row.images);
  const setPhoto = gallery.select;
  const [preview, setPreview] = useState(false);
  const previewTrigger = useRef<HTMLButtonElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const rememberPosition = () => rememberMarketPosition(cardRef.current);
  const rememberNavigationClick = (
    event: ReactMouseEvent<HTMLAnchorElement>,
  ) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    rememberPosition();
  };
  const photos = gallery.images;
  useEffect(() => {
    if (gallery.exhausted) onPhotosUnavailable?.(row.id);
  }, [gallery.exhausted, onPhotosUnavailable, row.id]);
  const index = gallery.index;
  const photoNavigation = usePhotoNavigation(
    (offset) => setPhoto((index + offset + photos.length) % photos.length),
    { enabled: photos.length > 1, swipe: true, tap: false },
  );
  const vendor = vendorIdentity(row.source, row.sourceUrl);
  const titleRead = titleBadgeModel({
    condition: row.condition,
    titleSource: row.titleSource,
    damageType: row.damageType,
  });
  const saved = useDiscoverySave({
    ...row,
    priceEvidence: {
      kind: row.price.kind,
      listedAmount: row.price.amount ?? undefined,
      ...(row.price.kind === "asking" && {
        askingPrice: row.price.amount ?? undefined,
      }),
      ...(row.price.kind === "current_bid" && {
        currentBid: row.price.amount ?? undefined,
      }),
      ...(row.price.kind === "buy_now" && {
        buyNow: row.price.amount ?? undefined,
      }),
      ...(row.price.kind === "reference" && {
        referenceValue: row.price.amount ?? undefined,
      }),
    },
    grade: "unknown",
    gradeLabel: "",
    discountPct: 0,
    alsoOn: [],
    listingCount: 1,
    lane: undefined,
    trueNetProfit: row.profitEstimate,
  });
  const freshness = listingFreshnessLabel(row);
  const price = row.price;
  const priceGapLabel =
    row.priceGap == null
      ? null
      : row.priceGap > 0
        ? "Below supported estimate"
        : row.priceGap < 0
          ? "Above supported estimate"
          : "At supported estimate";
  const modeledNetLabel =
    row.profitEstimate == null
      ? null
      : row.profitEstimate > 0
        ? "Modeled net after costs"
        : row.profitEstimate < 0
          ? "Modeled loss after costs"
          : "Modeled break-even after costs";
  if (onPhotosUnavailable && gallery.exhausted) return null;
  return (
    <article
      ref={cardRef}
      data-market-vehicle={row.id}
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 520px" }}
      className="relative min-w-0 overflow-hidden rounded-xl border border-[var(--b1)] bg-[var(--s1)] shadow-sm"
    >
      <div
        data-testid="market-card-photo"
        className="relative z-20 aspect-[16/9] overflow-hidden bg-[var(--s2)]"
      >
        {photos.length ? (
          <Link
            href={`/deal/${row.id}`}
            prefetch={false}
            onNavigate={rememberPosition}
            aria-label={`Open details for ${row.title}`}
            {...photoNavigation}
            onClick={(event) => {
              photoNavigation.onClick(event);
              rememberNavigationClick(event);
            }}
            className="block h-full w-full touch-pan-y focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedImage(photos[index])}
              alt={row.title}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
              onError={gallery.reject}
            />
          </Link>
        ) : (
          <Link
            href={`/deal/${row.id}`}
            prefetch={false}
            onNavigate={rememberPosition}
            aria-label={`Open details for ${row.title}`}
            className="flex h-full flex-col items-center justify-end gap-1 pb-3 text-[var(--t3)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--blue)]"
          >
            <Camera className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs">Source photo unavailable</span>
          </Link>
        )}
        {gallery.sourceImages.length > 0 && (
          <button
            ref={previewTrigger}
            type="button"
            title={`Enlarge photos of ${row.title}`}
            aria-label={`Enlarge photos of ${row.title}`}
            onClick={() => setPreview(true)}
            className="absolute bottom-2 left-2 grid h-11 w-11 place-items-center rounded-full bg-black/75 text-white"
          >
            <ZoomIn className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
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
      <div className="space-y-2.5 p-3">
        <div
          data-testid="market-card-price"
          className="flex flex-wrap items-end justify-between gap-2 border-b border-[var(--b1)] pb-2.5"
        >
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
        <div>
          <p className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-semibold text-[var(--t3)]">
            <span>{vendor.label}</span>
            <span className="uppercase tracking-wide">
              {row.sellerType ||
                row.lane?.replace(/-/g, " ") ||
                "Seller type unreported"}
            </span>
          </p>
          {photos[index]?.includes("carvana.io/stockimages/") && (
            <p className="mt-1 text-[10px] text-[var(--t3)]">
              Source stock photo
            </p>
          )}
          <h3
            data-testid="market-card-title"
            className="mt-1 break-words text-base font-bold leading-snug"
          >
            <Link
              href={`/deal/${row.id}`}
              prefetch={false}
              onNavigate={rememberPosition}
              onClick={rememberNavigationClick}
              className="hover:underline after:absolute after:inset-0 after:z-10 after:rounded-lg after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--blue)]"
            >
              {row.title || `${row.year} ${row.make} ${row.model}`}
            </Link>
          </h3>
          {row.trim && <p className="text-xs text-[var(--t3)]">{row.trim}</p>}
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
              ? bidStatusNote(row.auctionEndAt)
              : "Full purchase price needs confirmation at the source."}
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-[var(--s2)] p-2.5 text-xs">
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
            <dd className="font-semibold" title={titleRead.hint}>
              {titleRead.label}
              {titleRead.partsOnly ? " · Parts only" : ""}
              {titleRead.damage && !row.damageType
                ? ` · ${TITLE_DAMAGE_LABELS[titleRead.damage]}`
                : ""}
            </dd>
          </div>
          {row.damageType && (
            <div>
              <dt className="text-[var(--t3)]">
                {row.damageType.trim().toLowerCase() === "repairable"
                  ? "Source category"
                  : "Reported damage"}
              </dt>
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
        {row.identityWarning && (
          <p className="text-xs font-semibold text-[var(--amber-d)]">
            {row.identityWarning}
          </p>
        )}
        {flipDesk && row.sellEstimate != null && (
          <p className="text-xs text-[var(--t3)]">
            {row.valuationEvidence?.label.includes("asking-price")
              ? "Comparable asking estimate: "
              : "Estimated resale: "}
            <span className="font-semibold">
              {reportedPrice(row.sellEstimate)}
            </span>{" "}
            · {row.valuationEvidence?.label || "Estimate basis not recorded"}
          </p>
        )}
        {row.priceGap != null && priceGapLabel && (
          <div
            data-testid="market-price-gap"
            className="flex items-start justify-between gap-3 rounded-lg border border-[var(--b1)] bg-[var(--s2)] p-2.5"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--t1)]">
                {priceGapLabel}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t3)]">
                Before repair costs, fees and transport
              </p>
            </div>
            <strong className="shrink-0 text-sm tabular-nums text-[var(--t1)]">
              {Math.abs(row.priceGap).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </strong>
          </div>
        )}
        {flipDesk && row.profitEstimate != null && modeledNetLabel && (
          <div
            data-testid="market-modeled-net"
            className="flex items-start justify-between gap-3 rounded-lg border border-[var(--b1)] bg-[var(--s2)] p-2.5"
          >
            <div className="min-w-0">
              <p className="text-xs font-bold text-[var(--t1)]">
                {modeledNetLabel}
              </p>
              <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--t3)]">
                Model only. Verify price, title, condition, fees, transport and
                repair scope.
              </p>
            </div>
            <strong
              className={`shrink-0 text-sm tabular-nums ${
                row.profitEstimate > 0
                  ? "text-[var(--green)]"
                  : row.profitEstimate < 0
                    ? "text-[var(--red)]"
                    : "text-[var(--t1)]"
              }`}
            >
              {row.profitEstimate > 0 ? "+" : row.profitEstimate < 0 ? "-" : ""}
              {Math.abs(row.profitEstimate).toLocaleString("en-US", {
                style: "currency",
                currency: "USD",
                maximumFractionDigits: 0,
              })}
            </strong>
          </div>
        )}
        {flipDesk && row.valuationEvidence?.supported === false && (
          <p className="text-xs text-[var(--t3)]">
            {row.valuationEvidence.label}. Review market evidence in listing
            details.
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
            prefetch={false}
            className="relative z-20 inline-flex min-h-11 items-center text-xs font-bold text-[var(--blue)]"
            onNavigate={rememberPosition}
            onClick={rememberNavigationClick}
          >
            Review listing →
          </Link>
          {vendor.href && (
            <a
              href={vendor.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open ${vendor.label} listing in a new tab`}
              className="relative z-20 inline-flex min-h-11 items-center gap-1 text-xs font-semibold"
            >
              Source <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <PhotoPreview
        images={gallery.sourceImages.map((src) => ({
          src: proxiedImage(src),
          alt: row.title,
        }))}
        selectedIndex={preview ? gallery.sourceIndex : null}
        onSelect={(next) => {
          if (next === null) setPreview(false);
          else gallery.selectSource(next);
        }}
        returnFocusRef={previewTrigger}
        onPhotoLoad={(src) => {
          const original = gallery.sourceImages.find(
            (url) => proxiedImage(url) === src,
          );
          if (original) gallery.restore(original);
        }}
      />
    </article>
  );
}
