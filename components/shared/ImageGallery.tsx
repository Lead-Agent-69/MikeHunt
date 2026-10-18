"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Ico } from "./Ico";
import { cn } from "@/lib/utils";
import { galleryImageSrc } from "@/lib/image-url";
import { sourceLinkLabel } from "@/lib/sources/listing-link";
import { usePhotoSelection } from "@/hooks/usePhotoSelection";
import { ZoomablePhoto } from "./ZoomablePhoto";

interface ImageGalleryProps {
  images?: string[];
  title?: string;
  /** Shown if the hero photo fails to load (e.g. a dead listing URL) — e.g. an aerial of the parcel. */
  fallbackSrc?: string;
  /** The original source listing — rendered as a "View original ↗" link at the end of the gallery. */
  sourceUrl?: string;
}

export function ImageGallery(props: ImageGalleryProps) {
  return <ListingGallery key={JSON.stringify(props.images || [])} {...props} />;
}

function ListingGallery({
  images: rawImages = [],
  title = "Vehicle Image",
  fallbackSrc,
  sourceUrl,
}: ImageGalleryProps) {
  // Free-tier: direct source URLs for gallery frames; proxy only hotlink hosts
  // (and only the hero when the host does not block). Never next/image.
  const images = useMemo(
    () =>
      Array.from(new Set(rawImages || []))
        .map((url, index) => galleryImageSrc(url, index))
        .filter(Boolean),
    [rawImages],
  );
  const rawGallery = useMemo(
    () => Array.from(new Set(rawImages || [])).filter(Boolean),
    [rawImages],
  );
  const selection = usePhotoSelection(rawGallery);
  const currentIndex = selection.index;
  const setCurrentIndex = selection.select;
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [imageLoaded, setImageLoaded] = useState<Record<string, boolean>>({});
  const [imageError, setImageError] = useState<Record<string, boolean>>({});
  const lightboxRef = useRef<HTMLDialogElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const hasImages = images && images.length > 0;
  const currentImage = hasImages ? images[currentIndex] : null;

  // Preload next/prev images
  useEffect(() => {
    if (!hasImages) return;

    const preloadImage = (index: number) => {
      if (
        index >= 0 &&
        index < images.length &&
        !imageLoaded[images[index]] &&
        !imageError[images[index]]
      ) {
        const img = new Image();
        img.src = images[index];
        img.onload = () =>
          setImageLoaded((prev) => ({ ...prev, [images[index]]: true }));
        img.onerror = () =>
          setImageError((prev) => ({ ...prev, [images[index]]: true }));
      }
    };

    // Preload current, next, and previous
    preloadImage(currentIndex);
    preloadImage(currentIndex + 1);
    preloadImage(currentIndex - 1);
  }, [currentIndex, hasImages, images, imageLoaded, imageError]);

  // Keyboard navigation
  const currentSelection = useRef({ currentIndex, select: setCurrentIndex });
  currentSelection.current = { currentIndex, select: setCurrentIndex };
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLightboxOpen || !hasImages) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        currentSelection.current.select(
          (currentSelection.current.currentIndex + images.length - 1) %
            images.length,
        );
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        currentSelection.current.select(
          (currentSelection.current.currentIndex + 1) % images.length,
        );
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
    const previousFocus = returnFocus.current;
    const dialog = lightboxRef.current;
    dialog?.showModal();
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
      dialog?.close();
      previousFocus?.focus();
    };
  }, [isLightboxOpen, handleKeyDown]);

  const goToNext = () => {
    if (!hasImages) return;
    setCurrentIndex((currentIndex + 1) % images.length);
  };

  const goToPrev = () => {
    if (!hasImages) return;
    setCurrentIndex((currentIndex + images.length - 1) % images.length);
  };
  const openLightbox = (index: number) => {
    returnFocus.current = document.activeElement as HTMLElement;

    setCurrentIndex(index);
    setIsLightboxOpen(true);
  };

  return (
    <>
      {/* Source photo grid */}
      <div className="flex flex-col gap-3">
        {hasImages ? (
          <div className="grid grid-cols-1 md:grid-cols-4 md:grid-rows-2 gap-2 md:aspect-[21/9] rounded-[var(--r3)] overflow-hidden">
            {/* HERO IMAGE */}
            <button
              type="button"
              aria-label={`Open photo ${currentIndex + 1} of ${images.length}: ${title}`}
              className={cn(
                "relative group cursor-pointer overflow-hidden w-full aspect-[4/3] md:aspect-auto",
                images.length >= 5
                  ? "md:col-span-2 md:row-span-2"
                  : "md:col-span-4 md:row-span-2 md:aspect-[16/9]",
              )}
              onClick={() => openLightbox(currentIndex)}
            >
              {!imageLoaded[images[currentIndex]] &&
                !imageError[images[currentIndex]] && (
                  <div className="absolute inset-0 bg-gradient-to-r from-[var(--s2)] via-[var(--s3)] to-[var(--s2)] animate-pulse" />
                )}
              {imageError[images[currentIndex]] ? (
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
                  src={images[currentIndex]}
                  alt={`${title} - View ${currentIndex + 1}`}
                  className="w-full h-full object-contain bg-[var(--s2)]"
                  loading="eager"
                  onLoad={() =>
                    setImageLoaded((prev) => ({
                      ...prev,
                      [images[currentIndex]]: true,
                    }))
                  }
                  onError={() =>
                    setImageError((prev) => ({
                      ...prev,
                      [images[currentIndex]]: true,
                    }))
                  }
                />
              )}

              {/* View All button overlay on mobile only */}
              <div
                className="md:hidden absolute bottom-3 right-3 px-3 py-1 rounded-full text-white text-xs font-bold tracking-widest"
                style={{ background: "rgba(36,28,43,0.7)" }}
              >
                {currentIndex + 1} / {images.length}
              </div>
            </button>

            {/* SECONDARY IMAGES (Desktop only, if enough images exist) */}
            {images.length >= 5 &&
              images.slice(1, 5).map((img, idx) => {
                const realIdx = idx + 1;
                return (
                  <button
                    type="button"
                    aria-label={`Open photo ${realIdx + 1} of ${images.length}: ${title}`}
                    key={realIdx}
                    className="hidden md:block relative group cursor-pointer overflow-hidden"
                    onClick={() => openLightbox(realIdx)}
                  >
                    {!imageLoaded[images[realIdx]] &&
                      !imageError[images[realIdx]] && (
                        <div className="absolute inset-0 bg-gradient-to-r from-[var(--s2)] via-[var(--s3)] to-[var(--s2)] animate-pulse" />
                      )}
                    {imageError[images[realIdx]] ? (
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
                            [images[realIdx]]: true,
                          }))
                        }
                        onError={() =>
                          setImageError((prev) => ({
                            ...prev,
                            [images[realIdx]]: true,
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
                  </button>
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

        {images.length > 1 && (
          <div
            className={cn(
              "flex gap-2 overflow-x-auto pb-1",
              images.length >= 5 && "md:hidden",
            )}
            aria-label="Listing photo thumbnails"
          >
            {images.map((src, index) => (
              <button
                key={`${src}-${index}`}
                type="button"
                aria-label={`Preview photo ${index + 1} of ${images.length}: ${title}`}
                onClick={() => openLightbox(index)}
                className="h-16 w-20 shrink-0 overflow-hidden rounded-lg border border-[var(--b2)] bg-[var(--s2)] focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt={`Photo ${index + 1}`}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
        {hasImages && (
          <p className="text-sm text-[var(--t3)]" role="status">
            {images.length === 1
              ? "1 photo captured from the source. The original listing may have more."
              : `${images.length} listing photos`}
          </p>
        )}

        {/* End of the photos → jump to the original source listing. */}
        {sourceUrl && (
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-2.5 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] text-sm font-bold text-[var(--t2)] hover:border-[var(--b3)] hover:text-[var(--t1)] transition-colors"
          >
            <Ico name="external" size={15} /> {sourceLinkLabel(sourceUrl)}
          </a>
        )}
      </div>

      {/* LIGHTBOX MODAL */}
      {/* Escape transformed and overflow-clipped listing containers. */}
      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {isLightboxOpen && hasImages && (
              <motion.dialog
                ref={lightboxRef}
                role="dialog"
                aria-modal="true"
                aria-label={`${title} listing photos`}
                onCancel={(event) => {
                  event.preventDefault();
                  setIsLightboxOpen(false);
                }}
                className="fixed inset-y-0 left-0 z-[1000] m-0 flex h-[100dvh] w-[100dvw] max-h-[100dvh] max-w-[100dvw] items-center justify-center overflow-hidden border-0 bg-transparent px-4 pt-[max(5rem,env(safe-area-inset-top))] pb-[max(5rem,env(safe-area-inset-bottom))]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => setIsLightboxOpen(false)}
              >
                {/* Backdrop remains behind the photo and its controls. */}
                <motion.div
                  className="absolute inset-0"
                  style={{
                    opacity: 1,
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

                {/* Shared gestures, retry and zoom on every full-screen photo viewer. */}
                <ZoomablePhoto
                  src={currentImage!}
                  alt={`${title} - View ${currentIndex + 1}`}
                  multiple={images.length > 1}
                  move={(offset) => (offset > 0 ? goToNext() : goToPrev())}
                  onDismiss={() => setIsLightboxOpen(false)}
                  onPhotoLoad={() => {
                    setImageLoaded((previous) => ({
                      ...previous,
                      [currentImage!]: true,
                    }));
                    setImageError((previous) =>
                      previous[currentImage!]
                        ? { ...previous, [currentImage!]: false }
                        : previous,
                    );
                  }}
                />

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
                  Tap left / right or use arrow keys • drag down or ESC to close
                </div>
              </motion.dialog>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
