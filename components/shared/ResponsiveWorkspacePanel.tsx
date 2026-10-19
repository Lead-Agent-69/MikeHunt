"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useSyncExternalStore, type ReactNode, type RefObject } from "react";
import { X } from "lucide-react";

const query = "(max-width: 1023px)";
const subscribe = (changed: () => void) => {
  const media = window.matchMedia(query);
  media.addEventListener("change", changed);
  return () => media.removeEventListener("change", changed);
};

/** Keep complex controls in their own reachable, focus-contained phone screen. */
export function ResponsiveWorkspacePanel({
  id,
  title,
  open,
  onClose,
  returnFocusRef,
  footer,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  footer: ReactNode;
  children: ReactNode;
}) {
  const mobile = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
  if (!mobile)
    return (
      <section
        id={id}
        aria-label={title}
        className={open ? "space-y-4" : "hidden"}
      >
        {children}
        <div className="sticky bottom-3 z-20 rounded-xl border border-[var(--b1)] bg-[var(--s0)]/95 p-3 shadow-lg backdrop-blur">
          {footer}
        </div>
      </section>
    );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/60" />
        <Dialog.Content
          id={id}
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          className="fixed inset-0 z-[81] flex h-dvh min-h-0 flex-col bg-[var(--s0)] text-[var(--t1)] outline-none"
        >
          <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--b1)] px-3 pb-2 pt-[max(.5rem,env(safe-area-inset-top))]">
            <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
            <Dialog.Close
              aria-label={`Close ${title.toLowerCase()}`}
              className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)]"
            >
              <X className="h-5 w-5" />
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-3">
            {children}
          </div>
          <footer className="shrink-0 border-t border-[var(--b1)] px-3 pt-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
