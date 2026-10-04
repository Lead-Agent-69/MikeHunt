"use client";

import Link from "next/link";
import { CarFront, MapPinned, Search, ShieldCheck } from "lucide-react";

interface DataSetupStateProps {
  title?: string;
  message?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  compact?: boolean;
}

export function DataSetupState({
  title = "This workspace is ready for your first vehicle",
  message = "Find a vehicle, save it, and MIKEHUNT will keep the next decision and open checks together here.",
  primaryHref = "/discover",
  primaryLabel = "Find vehicles",
  secondaryHref = "/scan",
  secondaryLabel = "Refine search",
  compact = false,
}: DataSetupStateProps) {
  const steps = [
    {
      icon: Search,
      label: "Your search",
      detail: "Vehicle, location, budget",
    },
    {
      icon: MapPinned,
      label: "Relevant markets",
      detail: "Only matching listings",
    },
    {
      icon: CarFront,
      label: "Saved vehicles",
      detail: "Keep good options close",
    },
    {
      icon: ShieldCheck,
      label: "Clear next steps",
      detail: "Know what to check next",
    },
  ];

  return (
    <section className="glass-panel overflow-hidden">
      <div className={compact ? "p-5" : "p-6 md:p-8"}>
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Get started
          </p>
          <h2 className="mt-2 text-xl font-black text-[var(--t1)] md:text-2xl">
            {title}
          </h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
            {message}
          </p>

          <div className="mt-5 grid gap-2 sm:grid-cols-4">
            {steps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.label}
                  className="rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s1)] p-3 text-left"
                >
                  <Icon className="mb-2 h-4 w-4 text-[var(--amber)]" />
                  <div className="text-xs font-black text-[var(--t1)]">
                    {step.label}
                  </div>
                  <div className="mt-0.5 text-[11px] leading-snug text-[var(--t5)]">
                    {step.detail}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link
              href={primaryHref}
              className="inline-flex items-center justify-center rounded-[var(--r3)] px-4 py-2.5 text-sm font-bold text-white"
              style={{ background: "var(--grad)" }}
            >
              {primaryLabel}
            </Link>
            <Link
              href={secondaryHref}
              className="inline-flex items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)]"
            >
              {secondaryLabel}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
