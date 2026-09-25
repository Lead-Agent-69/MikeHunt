"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Wraps Next.js router navigation with the View Transitions API.
 * Falls back to normal navigation in browsers that don't support it.
 */
export function useViewTransition() {
  const router = useRouter();

  const transitionTo = useCallback(
    (href: string) => {
      if (
        typeof document !== "undefined" &&
        "startViewTransition" in document
      ) {
        (
          document as Document & {
            startViewTransition: (cb: () => void) => void;
          }
        ).startViewTransition(() => {
          router.push(href);
        });
      } else {
        router.push(href);
      }
    },
    [router],
  );

  return { transitionTo, router };
}
