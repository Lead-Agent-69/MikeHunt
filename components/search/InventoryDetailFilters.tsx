"use client";

import React, { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { INVENTORY_DETAIL_GROUPS } from "@/lib/search/extended-inventory-filters";

export function InventoryDetailFilters({
  values,
  onChange,
  keys,
  compact = false,
}: {
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
  keys?: string[];
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <div className="w-full space-y-4">
      {INVENTORY_DETAIL_GROUPS.map((group) => {
        const fields = group.fields.filter(
          (field) => !keys || keys.includes(field.key),
        );
        if (!fields.length) return null;
        const selected = fields.filter(
          (field) => values[field.key] && values[field.key] !== "all",
        );
        const isOpen = expanded[group.label] ?? selected.length > 0;
        const selectionLabel = selected
          .map((field) => {
            const value = values[field.key];
            const label =
              field.options?.find((option) => option.value === value)?.label ||
              value;
            return `${field.label}: ${label}`;
          })
          .join("; ");
        return (
          <div
            key={group.label}
            className="relative min-w-0 border-t border-[var(--b1)]"
          >
            <details
              open={isOpen}
              onToggle={(event) => {
                const open = event.currentTarget.open;
                if (open !== isOpen)
                  setExpanded((current) => ({
                    ...current,
                    [group.label]: open,
                  }));
              }}
              className="group min-w-0"
            >
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 py-3 pl-1 pr-14 text-sm font-semibold text-[var(--t1)] [&::-webkit-details-marker]:hidden">
                <div className="min-w-0 flex-1">
                  <span>{group.label}</span>
                  {selected.length > 0 && (
                    <>
                      <span className="ml-2 text-xs text-[var(--blue)]">
                        {selected.length} selected
                      </span>
                      <span className="mt-1 block break-words text-xs font-normal text-[var(--t3)]">
                        {selectionLabel}
                      </span>
                    </>
                  )}
                </div>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
                />
              </summary>
              <fieldset
                aria-label={group.label}
                className={`grid min-w-0 grid-cols-1 gap-3 pb-4 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}
              >
                {fields.map((field) => (
                  <label
                    key={field.key}
                    className="flex min-w-0 flex-col gap-1 text-xs font-medium text-[var(--t3)]"
                  >
                    {field.label}
                    {field.options ? (
                      <select
                        aria-label={field.label}
                        value={values[field.key] || ""}
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className="field min-h-11 min-w-0 !w-full !text-sm"
                      >
                        <option value="">{field.emptyLabel || "Any"}</option>
                        {field.options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        aria-label={field.label}
                        type={field.type || "text"}
                        value={values[field.key] || ""}
                        min={field.type === "number" ? 0 : undefined}
                        maxLength={
                          field.type === "text" || !field.type ? 60 : undefined
                        }
                        onChange={(event) =>
                          onChange(field.key, event.target.value)
                        }
                        className="field min-h-11 min-w-0 !w-full !text-sm"
                      />
                    )}
                  </label>
                ))}
              </fieldset>
            </details>
            {selected.length > 0 && (
              <button
                type="button"
                aria-label={`Clear ${group.label.toLowerCase()} filters`}
                title={`Clear ${group.label.toLowerCase()} filters`}
                onClick={() =>
                  selected.forEach((field) => onChange(field.key, ""))
                }
                className="absolute right-0 top-1 flex h-11 w-11 items-center justify-center rounded-md text-[var(--t3)] hover:bg-[var(--s2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]"
              >
                <RotateCcw size={16} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
