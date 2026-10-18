"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useRef, useState, type RefObject } from "react";
import { usePhotoNavigation } from "@/hooks/usePhotoNavigation";

interface PhotoPreviewProps {
  images: Array<{ src: string; alt: string }>;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function PhotoPreview({
  images,
  selectedIndex,
  onSelect,
  returnFocusRef,
}: PhotoPreviewProps) {
  const image = selectedIndex === null ? undefined : images[selectedIndex];
  const previousFocus = useRef<HTMLElement | null>(null);
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const [loadedPhoto, setLoadedPhoto] = useState<string | null>(null);
  const move = (offset: number) => {
    if (selectedIndex !== null && images.length) {
      onSelect((selectedIndex + offset + images.length) % images.length);
    }
  };
  const navigation = usePhotoNavigation(move, {
    enabled: images.length > 1,
    swipe: true,
  });
  if (!image) return null;
  const controls =
    "flex h-12 w-12 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20";

  return (
    <Dialog.Root
      open={Boolean(image)}
      onOpenChange={(open) => {
        if (!open) onSelect(null);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[1000] bg-black/95"
          onClick={(event) => event.stopPropagation()}
        />
        <Dialog.Content
          aria-describedby={undefined}
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          onOpenAutoFocus={() => {
            previousFocus.current =
              document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            const trigger = returnFocusRef?.current ?? previousFocus.current;
            if (trigger?.isConnected) {
              event.preventDefault();
              trigger.focus({ preventScroll: true });
            }
          }}
          className="fixed left-0 top-0 z-[1001] h-[100dvh] max-h-[100dvh] w-[100dvw] max-w-[100dvw] overflow-hidden px-4 pt-[max(5rem,env(safe-area-inset-top))] pb-[max(5rem,env(safe-area-inset-bottom))] outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              move(event.key === "ArrowLeft" ? -1 : 1);
            }
          }}
        >
          <Dialog.Title className="sr-only">
            {image?.alt || "Photo preview"}
          </Dialog.Title>
          <div
            data-photo-navigation
            className="relative flex h-full min-h-0 w-full max-w-full items-center justify-center overflow-hidden"
            style={{ touchAction: "pan-y pinch-zoom" }}
            {...navigation}
            onClick={(event) => {
              navigation.onClick(event);
              if (
                !event.defaultPrevented &&
                images.length === 1 &&
                event.target === event.currentTarget
              )
                onSelect(null);
            }}
          >
            {failedPhoto !== image.src && loadedPhoto !== image.src && (
              <div
                role="status"
                className="pointer-events-none absolute inset-0 grid place-items-center text-sm text-white/75"
              >
                Loading photo…
              </div>
            )}
            {image && failedPhoto === image.src ? (
              <div
                role="status"
                className="space-y-3 text-center text-sm text-white"
              >
                <p>This photo could not load.</p>
                <button
                  type="button"
                  className="min-h-11 rounded-lg border border-white/30 px-4"
                  onClick={() => setFailedPhoto(null)}
                >
                  Retry photo
                </button>
              </div>
            ) : (
              image && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={image.src}
                  src={image.src}
                  alt={image.alt}
                  className={`block h-auto max-h-full w-auto max-w-full object-contain ${loadedPhoto === image.src ? "opacity-100" : "opacity-0"}`}
                  draggable={false}
                  onLoad={() => setLoadedPhoto(image.src)}
                  onError={() => setFailedPhoto(image.src)}
                />
              )
            )}
          </div>
          <span
            className="absolute left-4 top-[max(1rem,env(safe-area-inset-top))] text-sm text-white"
            aria-live="polite"
          >
            {(selectedIndex ?? 0) + 1} / {images.length}
          </span>
          <Dialog.Close asChild>
            <button
              aria-label="Close photo preview"
              className={`${controls} absolute right-4 top-[max(1rem,env(safe-area-inset-top))]`}
            >
              <X size={24} />
            </button>
          </Dialog.Close>
          {images.length > 1 && (
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 items-center gap-4">
              <button
                aria-label="Previous image"
                className={controls}
                onClick={() => move(-1)}
              >
                <ChevronLeft size={24} />
              </button>
              <span className="text-center text-xs text-white/75">
                Tap left / right
              </span>
              <button
                aria-label="Next image"
                className={controls}
                onClick={() => move(1)}
              >
                <ChevronRight size={24} />
              </button>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
