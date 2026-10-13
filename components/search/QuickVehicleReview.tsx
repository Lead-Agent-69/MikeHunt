"use client";

import React, { useEffect, useId, useRef } from "react";
import Link from "next/link";
import { X, ExternalLink } from "lucide-react";
import { reportedPrice } from "@/lib/deals/reported-price";
import { TitleBadge } from "@/components/shared/TitleBadge";
import { RecentlySold } from "@/components/deal/RecentlySold";

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
  return (
    <dialog
      ref={dialog}
      onCancel={onClose}
      aria-labelledby={titleId}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-lg border border-[var(--b1)] bg-[var(--s0)] p-0 text-[var(--t1)] shadow-xl backdrop:bg-black/60"
    >
      <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--b1)] bg-[var(--s0)] p-4">
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
      <div className="space-y-5 p-4">
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
        <Link
          href={`/deal/${vehicle.id}`}
          className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-[var(--blue)] px-4 text-sm font-semibold text-white"
        >
          Open full analysis
        </Link>
      </div>
    </dialog>
  );
}
