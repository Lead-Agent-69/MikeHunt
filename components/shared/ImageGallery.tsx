"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import NextImage from "next/image";
import { Ico } from "./Ico";
import { cn } from "@/lib/utils";
import { proxiedImage } from "@/lib/image-url";

interface ImageGalleryProps {
  images?: string[];
  title?: string;
  /** Shown if the hero photo fails to load (e.g. a dead listing URL) — e.g. an aerial of the parcel. */
  fallbackSrc?: string;
  /** The original source listing — rendered as a "View original ↗" link at the end of the gallery. */
  sourceUrl?: string;
}

export function ImageGallery({
  images: rawImages = [],
  title = "Vehicle Image",
  fallbackSrc,
  sourceUrl,
}: ImageGalleryProps) {
  // Route every photo through the proxy so hotlink-protected sources load.
  const images = (rawImages || []).map(proxiedImage).filter(Boolean);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const hasImages = images && images.length > 0;
  const currentImage = hasImages ? images[currentIndex] : null;

  // Preload next/prev images
  useEffect(() => {
    if (!hasImages) return;

    const preloadImage = (index: number) => {
      if (index >= 0 && index < images.length && !imageLoaded[index]) {
        const img = new Image();
        img.src = images[index];
        img.onload = () =>
          setImageLoaded((prev) => ({ ...prev, [index]: true }));
        img.onerror = () =>
          setImageError((prev) => ({ ...prev, [index]: true }));
      }
    };

    // Preload current, next, and previous
    preloadImage(currentIndex);
    preloadImage(currentIndex + 1);
    preloadImage(currentIndex - 1);
  }, [currentIndex, hasImages, images, imageLoaded]);

  // Touch handlers for swipe
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = () => {
    if (!hasImages || images.length <= 1) return;

    const swipeThreshold = 50;
    const diff = touchStartX.current - touchEndX.current;

    if (Math.abs(diff) > swipeThreshold) {
      if (diff > 0) {
        // Swipe left - next image
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else {
        // Swipe right - previous image
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLightboxOpen || !hasImages) return;

      if (e.key === "ArrowLeft") {
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    },
    [isLightboxOpen, hasImages, images],
  );

  useEffect(() => {
    if (isLightboxOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "unset";
    };
  }, [isLightboxOpen, handleKeyDown]);

  const goToNext = () => {
    if (!hasImages) return;
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const goToPrev = () => {
    if (!hasImages) return;
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  return (
    <>
      {/* WOW CSS GRID LAYOUT */}
      <div className="flex flex-col gap-3">
        {hasImages ? (
          <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 md:aspect-[21/9] rounded-[var(--r3)] overflow-hidden">
            {/* HERO IMAGE */}
            <div
              className={cn(
                "relative group cursor-pointer overflow-hidden w-full aspect-[4/3] md:aspect-auto",
                images.length >= 5
                  ? "md:col-span-2 md:row-span-2"
                  : "md:col-span-4 md:row-span-2 md:aspect-[16/9]",
              )}
              onClick={() => setIsLightboxOpen(true)}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {!imageLoaded[0] && !imageError[0] && (
                <div className="absolute inset-0 bg-gradient-to-r from-[var(--s2)] via-[var(--s3)] to-[var(--s2)] animate-pulse" />
              )}
              {imageError[0] ? (
                fallbackSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={fallbackSrc}
                    alt={title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full bg-[var(--s2)] flex flex-col items-center justify-center text-[var(--t4)]">
                    <Ico
                      name="alert-triangle"
                      size={48}
                      className="opacity-20 mb-3 text-[var(--red)]"
                    />
                    <span className="text-sm font-bold uppercase tracking-widest">
                      Image Failed
                    </span>
                  </div>
                )
              ) : (
                <img
                  src={images[0]}
                  alt={`${title} - View 1`}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  loading="eager"
                  onLoad={() =>
                    setImageLoaded((prev) => ({ ...prev, [0]: true }))
                  }
                  onError={() =>
                    setImageError((prev) => ({ ...prev, [0]: true }))
                  }
                />
              )}

              {/* View All button overlay on mobile only */}
              <div
                className="md:hidden absolute bottom-3 right-3 px-3 py-1 rounded-full text-white text-xs font-bold tracking-widest"
                style={{ background: "rgba(36,28,43,0.7)" }}
              >
                1 / {images.length}
              </div>
            </div>

            {/* SECONDARY IMAGES (Desktop only, if enough images exist) */}
            {images.length >= 5 &&
              images.slice(1, 5).map((img, idx) => {
                const realIdx = idx + 1;
                return (
                  <div
                    key={realIdx}
                    className="hidden md:block relative group cursor-pointer overflow-hidden"
                    onClick={() => {
                      setCurrentIndex(realIdx);
                      setIsLightboxOpen(true);
                    }}
                  >
                    {!imageLoaded[realIdx] && !imageError[realIdx] && (
                      <div className="absolute inset-0 bg-gradient-to-r from-[var(--s2)] via-[var(--s3)] to-[var(--s2)] animate-pulse" />
                    )}
                    {imageError[realIdx] ? (
                      <div className="w-full h-full bg-[var(--s2)] flex items-center justify-center text-[var(--t4)]">
                        <Ico
                          name="alert-triangle"
                          size={24}
                          className="opacity-20 text-[var(--red)]"
                        />
                      </div>
                    ) : (
                      <img
                        src={img}
                        alt={`Thumb ${realIdx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        loading="lazy"
                        onLoad={() =>
                          setImageLoaded((prev) => ({
                            ...prev,
                            [realIdx]: true,
                          }))
                        }
                        onError={() =>
                          setImageError((prev) => ({
                            ...prev,
                            [realIdx]: true,
                          }))
                        }
                      />
                    )}
                    {/* If it's the last image in the grid but there are more images in total, show overlay */}
                    {realIdx === 4 && images.length > 5 && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center transition-opacity hover:bg-black/50">
                        <span className="text-white font-bold text-lg">
                          +{images.length - 5} photos
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ) : (
          <div className="w-full aspect-[4/3] bg-[var(--s2)] rounded-[var(--r3)] flex flex-col items-center justify-center text-[var(--t4)] border border-[var(--b1)]">
            <Ico name="car" size={48} className="opacity-20 mb-3" />
            <span className="text-sm font-bold uppercase tracking-widest">
              No Images Available
            </span>
          </div>
        )}

        {/* End of the photos → jump to the original source listing. */}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] text-sm font-bold text-[var(--t2)] hover:border-[var(--b3)] hover:text-[var(--t1)] transition-colors"
          >
            <Ico name="external" size={15} /> View original listing ↗
          </a>
        )}
      </div>

      {/* LIGHTBOX MODAL */}
      {isLightboxOpen && hasImages && (
        <div
          ref={lightboxRef}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(36,28,43,0.95)" }}
          onClick={() => setIsLightboxOpen(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setIsLightboxOpen(false)}
            className="absolute top-4 right-4 w-12 h-12 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors z-10 touch-manipulation"
            style={{ background: "rgba(255,255,255,0.1)" }}
            aria-label="Close lightbox"
          >
            <Ico name="close" size={24} />
          </button>

          {/* Image counter */}
          <div
            className="absolute top-4 left-4 px-4 py-2 rounded-full text-white text-sm font-bold tracking-widest z-10"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            {currentIndex + 1} / {images.length}
          </div>

          {/* Main image */}
          <div
            className="relative max-w-7xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {!imageLoaded[currentIndex] && !imageError[currentIndex] && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-white/20 border-t-white rounded-full animate-spin" />
              </div>
            )}

            {imageError[currentIndex] ? (
              <div className="flex flex-col items-center justify-center text-white">
                <Ico
                  name="alert-triangle"
                  size={64}
                  className="opacity-50 mb-4"
                />
                <span className="text-lg font-bold">Image Failed to Load</span>
              </div>
            ) : (
              <img
                src={currentImage!}
                alt={`${title} - View ${currentIndex + 1}`}
                className="max-w-full max-h-full object-contain"
                loading="eager"
              />
            )}
          </div>

          {/* Navigation arrows */}
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToPrev();
                }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation"
                style={{ background: "rgba(255,255,255,0.1)" }}
                aria-label="Previous image"
              >
                <Ico name="arrow" className="-rotate-180" size={28} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToNext();
                }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-14 h-14 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation"
                style={{ background: "rgba(255,255,255,0.1)" }}
                aria-label="Next image"
              >
                <Ico name="arrow" size={28} />
              </button>
            </>
          )}

          {/* Keyboard hint */}
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-xs font-medium tracking-wide hidden md:block"
            style={{ background: "rgba(255,255,255,0.1)" }}
          >
            Use arrow keys to navigate • ESC to close
          </div>
        </div>
      )}
    </>
  );
}
