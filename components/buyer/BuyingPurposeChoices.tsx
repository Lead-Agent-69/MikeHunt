"use client";

import { CarFront, Store, Wrench } from "lucide-react";
import type { BuyerMode } from "@/hooks/useBuyerIntent";

/** Buying intent selects useful tools; it never grants account permissions. */
export function BuyingPurposeChoices({
  value,
  onChange,
  loading = false,
}: {
  value?: BuyerMode;
  onChange: (value: BuyerMode) => void;
  loading?: boolean;
}) {
  if (loading)
    return (
      <div
        role="status"
        aria-label="Loading buying purpose"
        className="grid gap-2 sm:grid-cols-2"
      >
        <span className="sr-only">Loading buying preferences...</span>
        <div aria-hidden="true" className="h-32 rounded-xl bg-[var(--s2)]" />
        <div aria-hidden="true" className="h-32 rounded-xl bg-[var(--s2)]" />
      </div>
    );
  const resale = value === "dealer" || value === "reseller";
  const choices = [
    {
      key: "personal",
      label: "Buying a car to own",
      detail: "Focus on condition, safety and total cost.",
      icon: CarFront,
      mode: "personal" as BuyerMode,
      active: !value || value === "personal",
    },
    {
      key: "resale",
      label: "Buying for resale",
      detail: "Add resale evidence, repair budgets and inventory tools.",
      icon: Store,
      mode: resale ? value : ("reseller" as BuyerMode),
      active: resale,
    },
    ...(value === "diy" || value === "parts"
      ? [
          {
            key: value,
            label: value === "diy" ? "Repair project" : "Parts project",
            detail: "Your existing specialist preferences are retained.",
            icon: Wrench,
            mode: value,
            active: true,
          },
        ]
      : []),
  ];
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-bold text-[var(--t1)]">
        Buying purpose
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {choices.map(({ key, label, detail, icon: Icon, mode, active }) => (
          <label
            key={key}
            className={`flex min-h-24 cursor-pointer gap-3 rounded-xl border p-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--accent)] ${active ? "border-[var(--accent)] bg-[var(--accent-surface)]" : "border-[var(--b2)] bg-[var(--s0)]"}`}
          >
            <input
              type="radio"
              name="buying-purpose"
              value={key}
              checked={active}
              onChange={() => onChange(mode)}
              className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <Icon
                aria-hidden="true"
                size={21}
                className="mb-2 text-[var(--accent)]"
              />
              <span className="block text-sm font-bold text-[var(--t1)]">
                {label}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-[var(--t3)]">
                {detail}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
