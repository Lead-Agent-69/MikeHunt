"use client";
import { useState } from "react";
import { usePhotoSelection } from "./usePhotoSelection";
import { listingPhotos } from "@/lib/search/customer-inventory";

/** Try the next supplied photo on failure; never substitute a picture of another car. */
export function useListingPhotos(urls: unknown, listingId?: string) {
  const [failed, setFailed] = useState<string[]>([]);
  const supplied = listingPhotos(urls, Infinity);
  const selection = usePhotoSelection(supplied, listingId);
  const selected = supplied[selection.index];
  const images = supplied.filter((url) => !failed.includes(url));
  const image = selected && images.includes(selected) ? selected : images[0];
  return {
    sourceImages: supplied,
    sourceIndex: selection.index,
    selectSource: selection.select,
    restore: (src: string) =>
      setFailed((previous) =>
        previous.includes(src)
          ? previous.filter((url) => url !== src)
          : previous,
      ),
    images,
    image,
    index: image ? images.indexOf(image) : 0,
    exhausted: images.length === 0,
    select: (index: number) =>
      selection.select(supplied.indexOf(images[index])),
    reject: () => {
      if (image)
        setFailed((previous) =>
          previous.includes(image) ? previous : [...previous, image],
        );
    },
  };
}
