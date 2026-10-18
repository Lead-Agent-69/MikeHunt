"use client";

import { useRef, useState } from "react";
import { ZoomIn } from "lucide-react";
import { galleryImageSrc } from "@/lib/image-url";
import { listingPhotos } from "@/lib/search/customer-inventory";
import { usePhotoSelection } from "@/hooks/usePhotoSelection";
import { PhotoPreview } from "./PhotoPreview";

/** Give listing thumbnails the same full-photo viewer without hijacking their detail links. */
export function PhotoPreviewButton({
  images,
  title,
  className = "absolute bottom-2 right-2 z-20",
}: {
  images: unknown;
  title: string;
  className?: string;
}) {
  const photos = listingPhotos(images, Infinity);
  if (!photos.length) return null;
  return (
    <AvailablePreview
      key={JSON.stringify(photos)}
      photos={photos}
      title={title}
      className={className}
    />
  );
}

function AvailablePreview({
  photos,
  title,
  className,
}: {
  photos: string[];
  title: string;
  className: string;
}) {
  const selection = usePhotoSelection(photos);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={`Enlarge photos of ${title}`}
        title={`View ${photos.length} ${photos.length === 1 ? "photo" : "photos"}`}
        className={`${className} grid h-11 w-11 place-items-center rounded-full bg-black/75 text-white focus-visible:outline-2 focus-visible:outline-white`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      <PhotoPreview
        images={photos.map((src, index) => ({
          src: galleryImageSrc(src, index),
          alt: title,
        }))}
        selectedIndex={open ? selection.index : null}
        onSelect={(index) => {
          if (index === null) setOpen(false);
          else selection.select(index);
        }}
        returnFocusRef={trigger}
      />
    </>
  );
}
