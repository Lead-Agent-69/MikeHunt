"use client";
import { useRef, useState } from "react";
import { usePhotoSelection } from "./usePhotoSelection";
import { listingPhotos } from "@/lib/search/customer-inventory";

/** Try the next supplied photo on failure; never substitute a picture of another car. */
export function useListingPhotos(urls: unknown, listingId?: string) {
  const supplied = listingPhotos(urls, Infinity);
  const scope = JSON.stringify([listingId || null, supplied]);
  const current = useRef(scope);
  current.current = scope;
  const [failure, setFailure] = useState<{ scope: string; urls: string[] }>({
    scope,
    urls: [],
  });
  const failed = failure.scope === scope ? failure.urls : [];
  const selection = usePhotoSelection(supplied, listingId);
  const selected = supplied[selection.index];
  const images = supplied.filter((url) => !failed.includes(url));
  const image = selected && images.includes(selected) ? selected : images[0];
  return {
    sourceImages: supplied,
    sourceIndex: selection.index,
    selectSource: selection.select,
    restore: (src: string) => {
      if (current.current !== scope) return;
      setFailure((previous) => ({
        scope,
        urls:
          previous.scope === scope
            ? previous.urls.filter((url) => url !== src)
            : [],
      }));
    },
    images,
    image,
    index: image ? images.indexOf(image) : 0,
    exhausted: images.length === 0,
    select: (index: number) =>
      selection.select(supplied.indexOf(images[index])),
    reject: () => {
      if (image && current.current === scope)
        setFailure((previous) => {
          const urls = previous.scope === scope ? previous.urls : [];
          return urls.includes(image)
            ? previous
            : { scope, urls: [...urls, image] };
        });
    },
  };
}
