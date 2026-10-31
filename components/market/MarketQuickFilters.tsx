"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export type QuickMarketField = {
  key: string;
  label: string;
  value: string;
  inputLabel: string;
  disabled?: boolean;
};

/** Phone shortcuts open the same controls used on desktop; edits never become a second draft. */
export function MarketQuickFilters({
  fields,
  disabled,
  children,
}: {
  fields: QuickMarketField[];
  disabled: boolean;
  children: ReactNode;
}) {
  const panelId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLButtonElement | null>(null);
  const [inputLabel, setInputLabel] = useState<string | null>(null);
  const expanded = inputLabel !== null;

  useEffect(() => {
    if (!inputLabel) return;
    const input = Array.from(
      panel.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input, select",
      ) ?? [],
    ).find((element) => element.getAttribute("aria-label") === inputLabel);
    if (input && !input.disabled) input.focus();
  }, [inputLabel]);

  const close = () => {
    setInputLabel(null);
    returnFocus.current?.focus();
  };

  return (
    <div
      onKeyDown={(event) => {
        if (
          expanded &&
          event.key === "Escape" &&
          window.matchMedia("(max-width: 767px)").matches
        ) {
          event.preventDefault();
          event.stopPropagation();
          close();
        }
      }}
    >
      <nav
        aria-label="Quick search filters"
        className="grid grid-cols-3 gap-1.5 py-1 md:hidden"
      >
        {fields.map((field) => (
          <button
            key={field.key}
            type="button"
            disabled={disabled || field.disabled}
            aria-label={`Edit ${field.label.toLowerCase()}: ${field.value || "Any"}`}
            aria-controls={panelId}
            aria-expanded={expanded}
            data-selected={inputLabel === field.inputLabel}
            onClick={(event) => {
              returnFocus.current = event.currentTarget;
              setInputLabel((current) =>
                current === field.inputLabel ? null : field.inputLabel,
              );
            }}
            className="flex min-h-12 min-w-0 items-center justify-between gap-1 rounded-lg border border-[var(--b1)] bg-[var(--s1)] px-2 py-1 text-left data-[selected=true]:border-[var(--blue)] disabled:opacity-50"
          >
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold text-[var(--t3)]">
                {field.label}
              </span>
              <span className="block truncate text-xs font-bold text-[var(--t1)]">
                {field.value || "Any"}
              </span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className="h-3 w-3 shrink-0 text-[var(--t3)]"
            />
          </button>
        ))}
      </nav>
      <div
        ref={panel}
        id={panelId}
        className={expanded ? "block" : "hidden md:block"}
      >
        {children}
        <button
          type="button"
          onClick={close}
          className="mb-2 min-h-11 w-full rounded-lg bg-[var(--blue)] px-3 text-sm font-bold text-white md:hidden"
        >
          Done with quick filters
        </button>
      </div>
    </div>
  );
}
