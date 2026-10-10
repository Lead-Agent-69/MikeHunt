"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useRef } from "react";

interface PhotoPreviewProps {
  images: Array<{ src: string; alt: string }>;
  selectedIndex: number | null;
  onSelect: (index: number | null) => void;
}

export function PhotoPreview({
  images,
  selectedIndex,
  onSelect,
}: PhotoPreviewProps) {
  const image = selectedIndex === null ? undefined : images[selectedIndex];
  const previousFocus = useRef<HTMLElement | null>(null);
  const open = Boolean(image);
  useEffect(() => {
    if (open)
      previousFocus.current = document.activeElement as HTMLElement | null;
  }, [open]);
  const move = (offset: number) => {
    if (selectedIndex !== null && images.length) {
      onSelect((selectedIndex + offset + images.length) % images.length);
    }
  };
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
        <Dialog.Overlay className="fixed inset-0 z-[1000] bg-black/95" />
        <Dialog.Content
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            previousFocus.current?.focus();
          }}
          className="fixed inset-0 z-[1001] h-[100dvh] overflow-hidden px-4 pt-[max(5rem,env(safe-area-inset-top))] pb-[max(5rem,env(safe-area-inset-bottom))] outline-none"
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
            className="flex h-full min-h-0 items-center justify-center"
            onClick={() => onSelect(null)}
          >
            {image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.src}
                alt={image.alt}
                className="block h-full w-full max-w-7xl object-contain"
                draggable={false}
                onClick={(event) => event.stopPropagation()}
              />
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
            <div className="absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 flex -translate-x-1/2 gap-4">
              <button
                aria-label="Previous image"
                className={controls}
                onClick={() => move(-1)}
              >
                <ChevronLeft size={24} />
              </button>
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
