"use client";

import { useState } from "react";
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

export function VisionDamageInspector({
  imageUrl,
  images = [],
  sourceUrl,
}: {
  imageUrl?: string;
  images?: string[];
  vin?: string;
  sourceUrl?: string;
  onUpdateRepairEstimate?: (cost: number) => void;
}) {
  const photos = images.length ? images : imageUrl ? [imageUrl] : [];
  const [index, setIndex] = useState(0);
  const activeIndex = Math.min(index, Math.max(0, photos.length - 1));
  return (
    <section
      aria-label="Photo evidence"
      className="border-t border-[var(--b2)] py-6"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--t1)]">
          <Camera size={20} aria-hidden="true" /> Photo evidence
        </h2>
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--accent)]"
          >
            Original listing <ExternalLink size={14} aria-hidden="true" />
          </a>
        )}
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          {photos.length ? (
            <>
              <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-[var(--s2)]">
                {/* Listing hosts vary; retain the existing direct-image delivery path. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photos[activeIndex]}
                  alt={`Listing vehicle photo ${activeIndex + 1}`}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <button
                  type="button"
                  aria-label="Previous photo"
                  disabled={activeIndex === 0}
                  onClick={() => setIndex(activeIndex - 1)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b2)] disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden="true" size={18} />
                </button>
                <span className="text-sm text-[var(--t3)]" aria-live="polite">
                  Photo {activeIndex + 1} of {photos.length}
                </span>
                <button
                  type="button"
                  aria-label="Next photo"
                  disabled={activeIndex === photos.length - 1}
                  onClick={() => setIndex(activeIndex + 1)}
                  className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b2)] disabled:opacity-40"
                >
                  <ChevronRight aria-hidden="true" size={18} />
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--t3)]">
              No listing photos available.
            </p>
          )}
          <p className="mt-3 text-xs leading-relaxed text-[var(--t4)]">
            Photos supplied by the listing source. They are not an inspection
            report and may not show the vehicle&apos;s current condition.
          </p>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex items-start gap-2 text-sm text-[var(--t2)]">
            <ShieldAlert
              className="shrink-0 text-[var(--amber)]"
              size={19}
              aria-hidden="true"
            />
            <div>
              <h3 className="font-bold">Damage assessment not available</h3>
              <p className="mt-2 leading-relaxed text-[var(--t3)]">
                MIKEHUNT has not analyzed these photos for damage. No defects,
                confidence scores, or repair prices have been inferred from
                them.
              </p>
            </div>
          </div>
          <h3 className="text-sm font-bold text-[var(--t1)]">
            What still needs checking?
          </h3>
          <ul className="space-y-3 text-sm leading-relaxed text-[var(--t3)]">
            <li>Ask for close-ups of any reported damage and the underside.</li>
            <li>
              Verify airbags, structural condition, and whether the vehicle runs
              with a qualified inspector.
            </li>
            <li>
              Get a written repair quote before relying on a purchase ceiling.
            </li>
          </ul>
          <p className="border-t border-[var(--b1)] pt-3 text-xs leading-relaxed text-[var(--t4)]">
            A listing photo cannot confirm hidden mechanical damage, flood
            exposure, or roadworthiness.
          </p>
        </div>
      </div>
    </section>
  );
}
