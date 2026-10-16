"use client";
import { selectedSourceIds } from "@/lib/search/source-selection";

export function SourceFilter({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  const selected = selectedSourceIds(value);
  return (
    <details className="relative min-w-0 max-w-full text-sm">
      <summary className="min-h-11 cursor-pointer content-center rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-3 font-semibold text-[var(--t1)]">
        {label}: {selected.length ? `${selected.length} selected` : "All"}
      </summary>
      <fieldset className="mt-2 max-h-64 max-w-full space-y-1 overflow-y-auto rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-2">
        <legend className="sr-only">Choose listing sources</legend>
        <button
          type="button"
          onClick={() => onChange("all")}
          className="min-h-11 px-2 text-sm font-semibold text-[var(--blue)]"
        >
          All sources
        </button>
        {options
          .filter((option) => option.value !== "all")
          .map((option) => (
            <label
              key={option.value}
              className="flex min-h-11 max-w-64 items-center gap-2 px-2 text-sm text-[var(--t1)]"
            >
              <input
                type="checkbox"
                checked={selected.includes(option.value)}
                disabled={
                  selected.length >= 25 && !selected.includes(option.value)
                }
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.value]
                    : selected.filter((id) => id !== option.value);
                  onChange(next.sort().join(",") || "all");
                }}
              />
              <span className="min-w-0 break-words">{option.label}</span>
            </label>
          ))}
      </fieldset>
    </details>
  );
}
