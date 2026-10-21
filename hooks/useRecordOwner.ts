"use client";

import { useCallback, useEffect, useRef } from "react";

/** Ignore a completed record request after its account workspace unmounts. */
export function useRecordOwner(ownerId: string | null) {
  const activeOwner = useRef(ownerId);
  useEffect(() => {
    activeOwner.current = ownerId;
    return () => {
      activeOwner.current = null;
    };
  }, [ownerId]);
  return useCallback(
    () => Boolean(ownerId && activeOwner.current === ownerId),
    [ownerId],
  );
}
