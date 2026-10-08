"use client";

import React from "react";
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
  return (
    <div className="w-full space-y-4">
      {INVENTORY_DETAIL_GROUPS.map((group) => {
        const fields = group.fields.filter(
          (field) => !keys || keys.includes(field.key),
        );
        if (!fields.length) return null;
        return (
          <details
            key={group.label}
            open={compact ? undefined : true}
            className="min-w-0 border-t border-[var(--b1)] pt-3"
          >
            <summary className="min-h-11 cursor-pointer px-1 text-xs font-bold text-[var(--t3)]">
              {group.label}
            </summary>
            <fieldset
              aria-label={group.label}
              className={`grid min-w-0 grid-cols-1 gap-3 ${compact ? "" : "sm:grid-cols-2 lg:grid-cols-3"}`}
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
                      <option value="">Any</option>
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
        );
      })}
    </div>
  );
}
