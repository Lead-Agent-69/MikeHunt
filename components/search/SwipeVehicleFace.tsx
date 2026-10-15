"use client";
import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { proxiedImage } from "@/lib/image-url";
import { sourceLabel } from "@/lib/sources/source-meta";
import { TitleBadge } from "@/components/shared/TitleBadge";
import { QuickVehicleReview } from "./QuickVehicleReview";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { reportedPrice } from "@/lib/deals/reported-price";
import { vehicleLocation } from "@/lib/search/vehicle-location";
export type SwipeVehicle = {
  id: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number;
  priceEvidence?: PriceEvidence;
  images?: string[];
  mileage?: number;
  condition?: string;
  damageType?: string;
  titleSource?: string | null;
  locationCity?: string;
  locationState?: string;
  source?: string;
  sourceUrl?: string;
};
export function SwipeVehicleFace({
  deal,
  onPhotoUnavailable,
}: {
  deal: SwipeVehicle;
  onPhotoUnavailable?: (id: string) => void;
}) {
  const gallery = useListingPhotos(deal.images);
  const photo = gallery.index;
  const [review, setReview] = useState(false);
  const images = gallery.images;
  useEffect(() => {
    if (gallery.exhausted) onPhotoUnavailable?.(deal.id);
  }, [gallery.exhausted, onPhotoUnavailable, deal.id]);
  const title =
    deal.title ||
    [deal.year, deal.make, deal.model].filter(Boolean).join(" ") ||
    "Vehicle listing";
  const price = sourcePriceContext({
    source: deal.source,
    title,
    ask_price: deal.askPrice,
    source_url: deal.sourceUrl,
    price_evidence: deal.priceEvidence,
  });
  const location = vehicleLocation(deal.locationCity, deal.locationState);
  function changePhoto(next: number) {
    gallery.select(next);
  }
  if (gallery.exhausted) return null;
  return (
    <div className="flex h-full flex-col">
      <div className="relative h-[46%] w-full shrink-0 overflow-hidden bg-[var(--s2)]">
        {gallery.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedImage(images[photo])}
            alt={title}
            onError={gallery.reject}
            decoding="async"
            className="absolute inset-0 h-full w-full object-contain"
          />
        )}
        {images.length > 1 && images.length <= 8 && (
          <div
            className="absolute inset-x-3 top-3 flex gap-1"
            aria-label={`Photo ${photo + 1} of ${images.length}`}
          >
            {images.map((_, index) => (
              <span
                key={index}
                className={`h-1 flex-1 rounded-full ${index === photo ? "bg-white" : "bg-black/35"}`}
              />
            ))}
          </div>
        )}
        {images.length > 1 && (
          <div className="absolute inset-x-2 top-1/2 flex -translate-y-1/2 justify-between">
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              disabled={photo === 0}
              onClick={() => changePhoto(photo - 1)}
              title="Previous photo"
              aria-label="Previous photo"
              className="grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white disabled:opacity-20"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onPointerDown={(event) => event.stopPropagation()}
              disabled={photo === images.length - 1}
              onClick={() => changePhoto(photo + 1)}
              title="Next photo"
              aria-label="Next photo"
              className="grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white disabled:opacity-20"
            >
              <ChevronRight size={20} />
            </button>
          </div>
        )}
        <p className="absolute inset-x-0 bottom-0 bg-black/80 px-3 py-2 text-xs text-white">
          {sourceLabel(deal.source, deal.sourceUrl)}
          {images.length > 1 ? ` · ${photo + 1}/${images.length} photos` : ""}
        </p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        <h2 className="line-clamp-2 break-words text-base font-bold leading-snug">
          {title}
        </h2>
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <strong className="text-xl">{reportedPrice(price.amount)}</strong>
          <span className="text-[11px] text-[var(--t3)]">{price.label}</span>
        </div>
        <p className="text-xs text-[var(--t3)]">
          {deal.mileage != null
            ? `${deal.mileage.toLocaleString()} mi`
            : "Mileage not reported"}{" "}
          · {location}
        </p>
        <TitleBadge
          condition={deal.condition}
          damageType={deal.damageType}
          titleSource={deal.titleSource}
        />
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setReview(true)}
          className="mt-auto min-h-11 shrink-0 rounded-lg border border-[var(--b1)] text-sm font-semibold text-[var(--blue)]"
        >
          Quick review
        </button>
      </div>
      {review && (
        <QuickVehicleReview
          vehicle={{
            ...deal,
            title,
            askPrice: price.amount ?? undefined,
            priceLabel: price.label,
          }}
          onClose={() => setReview(false)}
        />
      )}
    </div>
  );
}
