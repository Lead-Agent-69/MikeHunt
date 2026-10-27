"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, ExternalLink, ChevronRight } from "lucide-react";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { useDiscoverySave } from "@/components/discovery/DiscoverySaveProvider";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { proxiedImage } from "@/lib/image-url";
import { sourceLabel } from "@/lib/sources/source-meta";
import { reportedPrice } from "@/lib/deals/reported-price";
import { TitleBadge } from "@/components/shared/TitleBadge";
import { QuickVehicleReview } from "@/components/search/QuickVehicleReview";
import { vehicleLocation } from "@/lib/search/vehicle-location";
import { PhotoPreviewButton } from "@/components/shared/PhotoPreviewButton";

export interface FeedVehicle {
  id: string;
  title: string;
  image?: string;
  images?: string[];
  source: string;
  sourceUrl?: string;
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number;
  priceLabel?: string;
  priceNote?: string;
  priceEvidence?: PriceEvidence;
  mileage?: number;
  condition?: string;
  damageType?: string;
  titleSource?: string;
  locationCity?: string;
  locationState?: string;
  lastSeenAt?: string;
  forYouReason?: string;
}

export function FeedVehicleCard({
  item,
  priority = false,
  onPhotoUnavailable,
}: {
  item: FeedVehicle;
  priority?: boolean;
  onPhotoUnavailable?: (id: string) => void;
}) {
  const saved = useDiscoverySave({
    ...item,
    images: item.images ?? (item.image ? [item.image] : []),
    askPrice: item.askPrice ?? 0,
    priceEvidence: item.priceEvidence ?? {
      kind: "unknown",
      listedAmount: item.askPrice,
    },
    titleSource:
      item.titleSource === "listing" || item.titleSource === "source_default"
        ? item.titleSource
        : undefined,
    grade: "unknown",
    gradeLabel: "",
    discountPct: 0,
    alsoOn: [],
    listingCount: 1,
  });
  const gallery = useListingPhotos([item.image, ...(item.images || [])]);
  useEffect(() => {
    if (gallery.exhausted) onPhotoUnavailable?.(item.id);
  }, [gallery.exhausted, onPhotoUnavailable, item.id]);
  const [review, setReview] = useState(false);
  const location = vehicleLocation(item.locationCity, item.locationState);
  if (gallery.exhausted) return null;
  return (
    <article
      data-testid="feed-vehicle"
      className="overflow-hidden rounded-lg border border-[var(--b1)] bg-[var(--s0)] lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]"
      style={{ contentVisibility: "auto", containIntrinsicSize: "auto 600px" }}
    >
      <div
        data-testid="feed-vehicle-photo"
        className="relative aspect-[4/3] min-w-0 bg-[var(--s2)] lg:aspect-auto lg:min-h-[380px]"
      >
        {gallery.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedImage(gallery.image)}
            alt={item.title}
            loading={priority ? "eager" : "lazy"}
            decoding="async"
            onError={gallery.reject}
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        <PhotoPreviewButton
          images={gallery.sourceImages}
          title={item.title}
          className="absolute right-2 top-2 z-20"
        />
      </div>
      <div className="flex min-w-0 flex-col gap-4 p-4 md:p-5">
        <div className="text-xs text-[var(--t3)]">
          <p>{sourceLabel(item.source, item.sourceUrl)}</p>
          {item.forYouReason && <p className="mt-1">{item.forYouReason}</p>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-lg font-bold leading-snug">
            {item.title}
          </h2>
          <button
            type="button"
            onClick={() => void saved.toggle()}
            disabled={saved.busy}
            aria-label={`${saved.label}: ${item.title}`}
            aria-pressed={saved.saved}
            title={saved.label}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-[var(--b1)] text-[var(--blue)] disabled:opacity-60"
          >
            <Heart
              size={20}
              className={saved.saved ? "fill-current" : ""}
              aria-hidden="true"
            />
          </button>
        </div>
        <div>
          <p className="text-xs text-[var(--t3)]">
            {item.priceLabel || "Advertised amount"}
          </p>
          <p className="mt-1 text-2xl font-bold">
            {reportedPrice(item.askPrice)}
          </p>
          <p className="mt-1 text-xs text-[var(--t3)]">
            {item.priceNote ||
              "Confirm the full purchase price and fees with the seller."}
          </p>
        </div>
        <p className="text-sm text-[var(--t3)]">
          {item.mileage != null
            ? `${item.mileage.toLocaleString()} mi`
            : "Mileage not reported"}{" "}
          · {location}
        </p>
        <TitleBadge
          condition={item.condition}
          damageType={item.damageType}
          titleSource={item.titleSource}
        />
        <p className="text-sm text-[var(--t3)]">
          Condition and total cost need checking before buying.
        </p>
        <p className="text-xs text-[var(--t3)]">
          {item.lastSeenAt && Number.isFinite(Date.parse(item.lastSeenAt)) ? (
            <>
              Last seen{" "}
              <time dateTime={item.lastSeenAt}>
                {new Intl.DateTimeFormat("en-US", {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }).format(new Date(item.lastSeenAt))}
              </time>
            </>
          ) : (
            "Last seen date not reported"
          )}
        </p>
        <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-[var(--b1)] pt-3">
          <button
            type="button"
            onClick={() => setReview(true)}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-[var(--on-accent)]"
          >
            Quick review <ChevronRight size={16} aria-hidden="true" />
          </button>
          <Link
            href={`/deal/${item.id}`}
            className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-[var(--blue)]"
          >
            Full analysis
          </Link>
          {item.sourceUrl && (
            <a
              href={item.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Original listing for ${item.title}`}
              title="Original listing"
              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)]"
            >
              <ExternalLink size={18} aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      {review && (
        <QuickVehicleReview vehicle={item} onClose={() => setReview(false)} />
      )}
    </article>
  );
}
