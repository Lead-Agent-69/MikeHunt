"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

export function SavedRemovalDialog({
  open,
  busy,
  vehicleLabel,
  error,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  vehicleLabel: string;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const restoreFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onCancel();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[120] w-[calc(100vw_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-5 text-[var(--t1)] shadow-xl"
          onOpenAutoFocus={() => {
            restoreFocus.current = document.activeElement as HTMLElement | null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = restoreFocus.current?.isConnected
              ? restoreFocus.current
              : document.getElementById("saved-vehicles-heading");
            target?.focus();
          }}
        >
          <Dialog.Title className="text-lg font-bold">
            Remove saved vehicle?
          </Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--t3)]">
            Remove {vehicleLabel} from your account watchlist? Notes on this
            saved entry are removed with it. Device backups and purchase history
            are kept.
          </Dialog.Description>
          {error && (
            <p role="alert" className="mt-3 text-sm text-[var(--red)]">
              {error}
            </p>
          )}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Button variant="outline" disabled={busy} onClick={onCancel}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={busy} onClick={onConfirm}>
              {busy ? "Removing…" : "Remove from account"}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
