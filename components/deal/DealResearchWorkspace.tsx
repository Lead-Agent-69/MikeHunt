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
  const controls = React.useRef<
    Partial<Record<ResearchView, HTMLButtonElement | null>>
  >({});

  return (
    <section
      aria-label="Focused vehicle research"
      className="browse-panel overflow-hidden"
    >
      <div className="border-b border-[var(--b1)] bg-[var(--s1)] p-2">
        <div
          role="tablist"
          aria-label="Vehicle research views"
          className="flex min-w-0 gap-1 overflow-x-auto sm:grid sm:grid-flow-col sm:auto-cols-fr"
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
                tabIndex={isActive ? 0 : -1}
                ref={(element) => {
                  controls.current[tab.id] = element;
                }}
                onClick={() => setActive(tab.id)}
                onKeyDown={(event) => {
                  const index = tabs.findIndex((item) => item.id === tab.id);
                  const next =
                    event.key === "ArrowRight"
                      ? (index + 1) % tabs.length
                      : event.key === "ArrowLeft"
                        ? (index + tabs.length - 1) % tabs.length
                        : event.key === "Home"
                          ? 0
                          : event.key === "End"
                            ? tabs.length - 1
                            : -1;
                  if (next < 0) return;
                  event.preventDefault();
                  setActive(tabs[next].id);
                  controls.current[tabs[next].id]?.focus();
                }}
                className="feedback-control premium-focus flex min-h-12 min-w-[8.5rem] shrink-0 items-center gap-2 rounded-full bg-transparent px-3 py-2 text-left transition-colors sm:min-w-0"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full"
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
        tabIndex={0}
        className="premium-focus min-h-40 p-3 md:p-4"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-[var(--t1)]">
              {selected.label}
            </p>
            <p className="text-xs text-[var(--t4)]">{selected.description}</p>
          </div>
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
