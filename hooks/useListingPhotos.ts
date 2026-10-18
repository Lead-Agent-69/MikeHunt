"use client";
import { useState } from "react";
import { listingPhotos } from "@/lib/search/customer-inventory";

/** Try the next supplied photo on failure; never substitute a picture of another car. */
export function useListingPhotos(urls: unknown) {
  const [failed, setFailed] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const images = listingPhotos(urls, Infinity).filter(
    (url) => !failed.includes(url),
  );
  const image = selected && images.includes(selected) ? selected : images[0];
  return {
    images,
    image,
    index: image ? images.indexOf(image) : 0,
    exhausted: images.length === 0,
    select: (index: number) => setSelected(images[index] ?? null),
    reject: () => {
      if (image)
        setFailed((previous) =>
          previous.includes(image) ? previous : [...previous, image],
        );
    },
  };
}
