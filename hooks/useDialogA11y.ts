"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );
}

/**
 * Keyboard behaviour every modal dialog, sheet and drawer should share:
 * focus moves into the panel when it opens, Tab and Shift+Tab stay inside it,
 * Escape closes it, and focus returns to whatever opened it.
 *
 * Pair it with `role="dialog"`, `aria-modal="true"` and an accessible name
 * (`aria-labelledby` or `aria-label`) on the panel element.
 */
export function useDialogA11y(
  open: boolean,
  onClose: () => void,
  panelRef: RefObject<HTMLElement | null>,
  options: { lockScroll?: boolean } = {},
) {
  const { lockScroll = true } = options;
  // Keep the latest onClose without re-running the effect (and re-stealing
  // focus) every render when callers pass an inline arrow.
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const previous =
      typeof document !== "undefined"
        ? (document.activeElement as HTMLElement | null)
        : null;
    const overflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = "hidden";

    const frame = window.requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel || panel.contains(document.activeElement)) return;
      const target =
        panel.querySelector<HTMLElement>("[autofocus],[data-autofocus]") ??
        focusableIn(panel)[0] ??
        panel;
      if (target === panel && !panel.hasAttribute("tabindex")) {
        panel.setAttribute("tabindex", "-1");
      }
      target.focus({ preventScroll: true });
    });

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = focusableIn(panel);
      if (items.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panel.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      if (lockScroll) document.body.style.overflow = overflow;
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [open, lockScroll, panelRef]);
}
