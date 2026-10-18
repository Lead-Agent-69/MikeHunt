"use client";

import { Camera } from "lucide-react";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { proxiedImage } from "@/lib/image-url";

/** A failed cover tries the listing's other photos, then shows an honest placeholder. */
export function ListingThumbnail({
  images,
  title,
  className = "h-full w-full object-contain",
}: {
  images: unknown;
  title: string;
  className?: string;
}) {
  const gallery = useListingPhotos(images);
  return gallery.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      key={gallery.image}
      src={proxiedImage(gallery.image)}
      alt={title}
      loading="lazy"
      decoding="async"
      className={className}
      onError={gallery.reject}
    />
  ) : (
    <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-2 text-center text-xs font-normal text-[var(--t3)]">
      <Camera className="h-4 w-4" aria-hidden="true" />
      Photo unavailable
    </span>
  );
}
