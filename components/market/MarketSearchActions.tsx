"use client";

import * as Menu from "@radix-ui/react-dropdown-menu";
import { BookmarkPlus, Copy, Ellipsis, RotateCcw } from "lucide-react";

export function MarketSearchActions({
  onSave,
  onCopy,
  onReset,
  disabled = false,
}: {
  onSave: () => void;
  onCopy: () => void;
  onReset: () => void;
  disabled?: boolean;
}) {
  const itemClass =
    "flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-3 text-sm outline-none focus:bg-[var(--s2)]";
  return (
    <div className="flex shrink-0 gap-1.5 sm:gap-2">
      <button
        type="button"
        aria-label="Save search on this device"
        title="Save search on this device"
        disabled={disabled}
        onClick={onSave}
        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[var(--blue)] px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
      >
        <BookmarkPlus className="hidden h-4 w-4 sm:block" aria-hidden="true" />
        <span>
          Save<span className="hidden sm:inline"> search</span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Copy filtered search link"
        onClick={onCopy}
        className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs font-semibold sm:inline-flex"
      >
        <Copy className="h-4 w-4" />
        Copy search
      </button>
      <button
        type="button"
        aria-label="Reset filters"
        onClick={onReset}
        className="hidden min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-3 text-xs font-semibold sm:inline-flex"
      >
        <RotateCcw className="h-4 w-4" />
        Reset
      </button>
      <Menu.Root>
        <Menu.Trigger
          aria-label="Search actions"
          className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--b1)] sm:hidden"
        >
          <Ellipsis className="h-5 w-5" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content
            align="end"
            sideOffset={6}
            className="z-[90] min-w-48 rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-1 text-[var(--t1)] shadow-xl"
          >
            <Menu.Item onSelect={onCopy} className={itemClass}>
              <Copy className="h-4 w-4" />
              Copy search link
            </Menu.Item>
            <Menu.Item onSelect={onReset} className={itemClass}>
              <RotateCcw className="h-4 w-4" />
              Reset filters
            </Menu.Item>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}
