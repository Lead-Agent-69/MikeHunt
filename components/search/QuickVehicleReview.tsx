"use client";

import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { reportedPrice } from "@/lib/deals/reported-price";
import { TitleBadge } from "@/components/shared/TitleBadge";
import { RecentlySold } from "@/components/deal/RecentlySold";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { proxiedImage } from "@/lib/image-url";
import { vehicleLocation } from "@/lib/search/vehicle-location";
import { sourceLabel } from "@/lib/sources/source-meta";
import { ChevronLeft, ChevronRight } from "lucide-react";

export type ReviewVehicle = {
  id: string;
  title: string;
  askPrice?: number;
  priceLabel?: string;
  priceNote?: string;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  condition?: string;
  damageType?: string;
  titleSource?: string | null;
  image?: string;
  images?: string[];
  source?: string;
  sourceUrl?: string;
  locationCity?: string;
  locationState?: string;
};

export function QuickVehicleReview({
  vehicle,
  onClose,
}: {
  vehicle: ReviewVehicle;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const gallery = useListingPhotos([vehicle.image, ...(vehicle.images || [])]);
  useEffect(() => {
    const node = dialog.current;
    const previousOverflow = document.body.style.overflow;
    const trigger = document.activeElement;
    document.body.style.overflow = "hidden";
    node?.showModal();
    return () => {
      node?.close();
      document.body.style.overflow = previousOverflow;
      if (trigger instanceof HTMLElement && trigger.isConnected)
        trigger.focus();
    };
  }, []);
  const soldQuery = [vehicle.year, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(" ");
  // Feed cards use content-visibility/containment. Keep the modal outside that
  // optimized subtree so an offscreen card cannot suppress its dialog painting.
  if (typeof document === "undefined") return null;
  return createPortal(
    <dialog
      ref={dialog}
      onCancel={onClose}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (
          gallery.images.length > 1 &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.shiftKey &&
          (event.key === "ArrowLeft" || event.key === "ArrowRight")
        ) {
          event.preventDefault();
          gallery.select(
            (gallery.index +
              (event.key === "ArrowRight" ? 1 : -1) +
              gallery.images.length) %
              gallery.images.length,
          );
        }
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto h-[85dvh] max-h-[900px] w-[calc(100%-2rem)] max-w-2xl overflow-hidden rounded-lg border border-[var(--b1)] bg-[var(--s0)] p-0 text-[var(--t1)] shadow-xl backdrop:bg-black/60 open:flex open:flex-col"
    >
      <div className="z-10 flex shrink-0 items-start justify-between gap-3 border-b border-[var(--b1)] bg-[var(--s0)] p-4">
        <h2 id={titleId} className="min-w-0 break-words text-lg font-bold">
          {vehicle.title}
        </h2>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          aria-label="Close quick review"
          title="Close"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-[var(--b1)]"
        >
          <X size={20} aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-4">
        {gallery.image && !gallery.exhausted && (
          <div className="relative overflow-hidden rounded-xl bg-[var(--s2)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={proxiedImage(gallery.image)}
              alt={vehicle.title}
              onError={gallery.reject}
              decoding="async"
              className="h-48 w-full object-contain sm:h-64"
            />
            {gallery.images.length > 1 && (
              <div className="absolute inset-x-2 bottom-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Previous review photo"
                  onClick={() =>
                    gallery.select(
                      (gallery.index + gallery.images.length - 1) %
                        gallery.images.length,
                    )
                  }
                  className="grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white"
                >
                  <ChevronLeft aria-hidden="true" size={20} />
                </button>
                <span
                  className="rounded-full bg-black/70 px-3 py-1 text-xs text-white"
                  aria-live="polite"
                >
                  Photo {gallery.index + 1} of {gallery.images.length}
                </span>
                <button
                  type="button"
                  aria-label="Next review photo"
                  onClick={() =>
                    gallery.select((gallery.index + 1) % gallery.images.length)
                  }
                  className="grid h-11 w-11 place-items-center rounded-full bg-black/70 text-white"
                >
                  <ChevronRight aria-hidden="true" size={20} />
                </button>
              </div>
            )}
          </div>
        )}
        <p className="text-sm text-[var(--t3)]">
          {vehicle.mileage != null
            ? `${vehicle.mileage.toLocaleString()} mi`
            : "Mileage not reported"}
          {" · "}
          {vehicleLocation(vehicle.locationCity, vehicle.locationState)}
          {vehicle.source && (
            <> · {sourceLabel(vehicle.source, vehicle.sourceUrl)}</>
          )}
        </p>
        <div>
          <p className="text-xs text-[var(--t3)]">
            {vehicle.priceLabel || "Advertised amount"}
          </p>
          <p className="text-2xl font-bold">
            {reportedPrice(vehicle.askPrice)}
          </p>
          <p className="mt-1 text-sm text-[var(--t3)]">
            {vehicle.priceNote ||
              "Confirm the cash price, fees and repair costs. An advertised amount alone is not an all-in estimate."}
          </p>
        </div>
        <TitleBadge
          condition={vehicle.condition}
          damageType={vehicle.damageType}
          titleSource={vehicle.titleSource}
        />
        <section className="border-y border-[var(--b1)] py-4">
          <h3 className="font-semibold">What still needs checking?</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--t3)]">
            Verify title documents, service history, an inspection and the
            seller's full purchase price. Photos cannot prove mechanical
            condition or hidden damage.
          </p>
        </section>
        <RecentlySold
          make={vehicle.make}
          model={vehicle.model}
          year={vehicle.year}
        />
        <section>
          <h3 className="font-semibold">Research auction results</h3>
          <p className="mt-1 text-xs text-[var(--t3)]">
            External records need matching by year, trim, mileage and title. A
            final bid or hidden accepted offer is not a confirmed sale price.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <a
              href="https://carsandbids.com/past-auctions/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-sm"
            >
              Cars &amp; Bids results{" "}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
            <a
              href={`https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(soldQuery)}&_sacat=6001&LH_Sold=1&LH_Complete=1`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-sm"
            >
              eBay Motors sold results{" "}
              <ExternalLink size={14} aria-hidden="true" />
            </a>
          </div>
        </section>
      </div>
      <div className="shrink-0 border-t border-[var(--b1)] bg-[var(--s0)] p-3">
        <Link
          href={`/deal/${vehicle.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)]"
        >
          Open full analysis
        </Link>
      </div>
    </dialog>,
    document.body,
  );
}
