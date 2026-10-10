"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  motion,
  animate,
  useMotionValue,
  useTransform,
  AnimatePresence,
} from "framer-motion";
import { Ico } from "./Ico";
import { cn } from "@/lib/utils";
import { galleryImageSrc } from "@/lib/image-url";

// Direction drives the lightbox slide: 0 means "just opened", so it zooms in place
// rather than flying in from a side the user didn't ask for.
const slideVariants = {
  enter: (dir: number) => ({
    x: dir === 0 ? 0 : dir > 0 ? 320 : -320,
    opacity: 0,
    scale: dir === 0 ? 0.94 : 0.98,
  }),
  center: { x: 0, opacity: 1, scale: 1 },
  exit: (dir: number) => ({
    x: dir === 0 ? 0 : dir > 0 ? -320 : 320,
    opacity: 0,
    scale: 0.94,
  }),
};

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
  // Free-tier: direct source URLs for gallery frames; proxy only hotlink hosts
  // (and only the hero when the host does not block). Never next/image.
  const images = (rawImages || [])
    .map((url, index) => galleryImageSrc(url, index))
    .filter(Boolean);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [direction, setDirection] = useState(0);
  const [imageLoaded, setImageLoaded] = useState<Record<number, boolean>>({});
  const [imageError, setImageError] = useState<Record<number, boolean>>({});
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  // Dragging the photo down dismisses the lightbox; the backdrop fades out in step so the
  // gesture reads as "pushing the image away" rather than a hard close.
  const dragY = useMotionValue(0);
  const backdropOpacity = useTransform(dragY, [0, 220], [1, 0.35]);

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
    touchEndX.current = touchStartX.current;
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
        setDirection(1);
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else {
        // Swipe right - previous image
        setDirection(-1);
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      }
    }
  };

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLightboxOpen || !hasImages) return;

      if (e.key === "ArrowLeft") {
        setDirection(-1);
        setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
      } else if (e.key === "ArrowRight") {
        setDirection(1);
        setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
      } else if (e.key === "Escape") {
        setIsLightboxOpen(false);
      }
    },
    [isLightboxOpen, hasImages, images.length],
  );

  useEffect(() => {
    if (!isLightboxOpen) return;
    // Restore whatever the page had before — the dashboard locks scroll elsewhere too, so
    // hard-coding "unset" would clobber it.
    const prevOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    lightboxRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const buttons =
        lightboxRef.current?.querySelectorAll<HTMLButtonElement>("button");
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keydown", trapFocus);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keydown", trapFocus);
      document.body.style.overflow = prevOverflow;
      previousFocus?.focus();
    };
  }, [isLightboxOpen, handleKeyDown]);

  const goToNext = () => {
    if (!hasImages) return;
    setDirection(1);
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
  };

  const goToPrev = () => {
    if (!hasImages) return;
    setDirection(-1);
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
  };

  const openLightbox = (index: number) => {
    // A drag-dismiss leaves the photo offset; clear it so the next open starts centred.
    dragY.set(0);
    setDirection(0);
    setCurrentIndex(index);
    setIsLightboxOpen(true);
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
              onClick={() => openLightbox(0)}
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
                    onClick={() => openLightbox(realIdx)}
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
      {/* Escape transformed and overflow-clipped listing containers. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isLightboxOpen && hasImages && (
              <motion.div
                ref={lightboxRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${title} photos`}
                className="fixed inset-0 z-[1000] flex h-[100dvh] items-center justify-center overflow-hidden px-4 pt-[max(5rem,env(safe-area-inset-top))] pb-[max(5rem,env(safe-area-inset-bottom))]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setIsLightboxOpen(false)}
              >
                {/* Backdrop sits on its own layer so the drag can fade it independently. */}
                <motion.div
                  className="absolute inset-0"
                  style={{
                    opacity: backdropOpacity,
                    background: "rgba(0,0,0,0.95)",
                  }}
                />

                {/* Close button */}
                <button
                  onClick={() => setIsLightboxOpen(false)}
                  className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 w-12 h-12 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors z-10 touch-manipulation"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                  aria-label="Close lightbox"
                >
                  <Ico name="close" size={24} />
                </button>

                {/* Image counter */}
                <div
                  className="absolute top-[max(1rem,env(safe-area-inset-top))] left-4 px-4 py-2 rounded-full text-white text-sm font-bold tracking-widest z-10"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  {currentIndex + 1} / {images.length}
                </div>

                {/* Main image */}
                <div
                  className="relative max-w-7xl w-full h-full min-h-0 flex items-center justify-center z-[5]"
                  onClick={(e) => e.stopPropagation()}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <AnimatePresence
                    initial={false}
                    custom={direction}
                    mode="popLayout"
                  >
                    <motion.div
                      key={currentIndex}
                      custom={direction}
                      variants={slideVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{
                        type: "spring",
                        stiffness: 320,
                        damping: 32,
                      }}
                      drag="y"
                      dragConstraints={{ top: 0, bottom: 0 }}
                      dragElastic={0.55}
                      style={{ y: dragY }}
                      className="relative flex h-full min-h-0 w-full items-center justify-center cursor-grab active:cursor-grabbing"
                      onDragEnd={(_, info) => {
                        if (
                          Math.abs(info.offset.y) > 140 ||
                          Math.abs(info.velocity.y) > 700
                        ) {
                          setIsLightboxOpen(false);
                        } else {
                          animate(dragY, 0, {
                            type: "spring",
                            stiffness: 380,
                            damping: 30,
                          });
                        }
                      }}
                    >
                      {!imageLoaded[currentIndex] &&
                        !imageError[currentIndex] && (
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
                          <span className="text-lg font-bold">
                            Image Failed to Load
                          </span>
                        </div>
                      ) : (
                        <img
                          src={currentImage!}
                          alt={`${title} - View ${currentIndex + 1}`}
                          className="block w-full h-full min-h-0 object-contain"
                          loading="eager"
                          draggable={false}
                        />
                      )}
                    </motion.div>
                  </AnimatePresence>
                </div>

                {/* Navigation arrows */}
                {images.length > 1 && (
                  <>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        goToPrev();
                      }}
                      className="absolute left-[calc(50%-4rem)] bottom-[max(1rem,env(safe-area-inset-bottom))] md:left-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 w-12 h-12 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation z-10"
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
                      className="absolute right-[calc(50%-4rem)] bottom-[max(1rem,env(safe-area-inset-bottom))] md:right-4 md:bottom-auto md:top-1/2 md:-translate-y-1/2 w-12 h-12 rounded-full text-white flex items-center justify-center hover:bg-white/20 transition-colors touch-manipulation z-10"
                      style={{ background: "rgba(255,255,255,0.1)" }}
                      aria-label="Next image"
                    >
                      <Ico name="arrow" size={28} />
                    </button>
                  </>
                )}

                {/* Keyboard hint */}
                <div
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-xs font-medium tracking-wide hidden md:block z-10"
                  style={{ background: "rgba(255,255,255,0.1)" }}
                >
                  Arrow keys to navigate • drag down or ESC to close
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
