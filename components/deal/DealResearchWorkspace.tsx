"use client";

import React from "react";
import {
  BrainCircuit,
  CarFront,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AIBrief } from "@/components/deal/AIBrief";
import { DealIQCard } from "@/components/deal/DealIQCard";
import { VehicleSpecs } from "@/components/deal/VehicleSpecs";

type ResearchView = "deal-iq" | "ai-brief" | "vehicle-specs";

type ResearchTab = {
  id: ResearchView;
  label: string;
  description: string;
  icon: LucideIcon;
};

export function DealResearchWorkspace({
  dealId,
  vin,
  make,
  dealerMode,
}: {
  dealId: string;
  vin?: string | null;
  make?: string | null;
  dealerMode: boolean;
}) {
  const tabs = React.useMemo<ResearchTab[]>(
    () => [
      ...(dealerMode
        ? [
            {
              id: "deal-iq" as const,
              label: "Deal IQ",
              description: "Explain the score and the signals behind it.",
              icon: BrainCircuit,
            },
          ]
        : []),
      {
        id: "ai-brief",
        label: "AI brief",
        description: "Generate a plain-English research brief on demand.",
        icon: Sparkles,
      },
      {
        id: "vehicle-specs",
        label: "Vehicle data",
        description: "Review decoded VIN and manufacturer specifications.",
        icon: CarFront,
      },
    ],
    [dealerMode],
  );
  const [active, setActive] = React.useState<ResearchView>(
    dealerMode ? "deal-iq" : "ai-brief",
  );

  React.useEffect(() => {
    if (!tabs.some((tab) => tab.id === active)) setActive(tabs[0].id);
  }, [active, tabs]);

  const selected = tabs.find((tab) => tab.id === active) ?? tabs[0];

  return (
    <section
      aria-label="Focused vehicle research"
      className="overflow-hidden rounded-[var(--r3)] border border-[var(--b1)] bg-[var(--s0)]"
    >
      <div className="border-b border-[var(--b1)] bg-[var(--s1)] p-2">
        <div
          role="tablist"
          aria-label="Vehicle research views"
          className="grid grid-cols-1 gap-1 sm:grid-flow-col sm:auto-cols-fr"
        >
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === selected.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                id={`research-tab-${tab.id}`}
                aria-selected={isActive}
                aria-controls={`research-panel-${tab.id}`}
                onClick={() => setActive(tab.id)}
                className="premium-focus interactive-surface flex min-h-12 items-center gap-3 rounded-[var(--r2)] px-3 py-2 text-left"
                style={{
                  background: isActive ? "var(--s0)" : "transparent",
                  boxShadow: isActive ? "var(--shadow1)" : "none",
                }}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r2)]"
                  style={{
                    background: "var(--s2)",
                    color: isActive ? "var(--blue)" : "var(--t4)",
                  }}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-black text-[var(--t1)]">
                    {tab.label}
                  </span>
                  <span className="hidden text-[10px] leading-snug text-[var(--t4)] lg:block">
                    {tab.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div
        role="tabpanel"
        id={`research-panel-${selected.id}`}
        aria-labelledby={`research-tab-${selected.id}`}
        className="min-h-40 p-3 md:p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-[var(--t1)]">
              {selected.label}
            </p>
            <p className="text-xs text-[var(--t4)]">{selected.description}</p>
          </div>
          <span className="rounded-full border border-[var(--b1)] bg-[var(--s1)] px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[var(--t4)]">
            One tool at a time
          </span>
        </div>

        {selected.id === "deal-iq" && <DealIQCard dealId={dealId} />}
        {selected.id === "ai-brief" && <AIBrief dealId={dealId} />}
        {selected.id === "vehicle-specs" && (
          <VehicleSpecs vin={vin} make={make} />
        )}
      </div>
    </section>
  );
}
