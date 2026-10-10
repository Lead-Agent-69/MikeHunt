import React from "react";
import {
  titleBadgeModel,
  TITLE_DAMAGE_LABELS,
  PARTS_ONLY_LABEL,
  type TitleBadgeTone,
} from "@/lib/deals/title-badge-model";

// One honest title badge for every card, the deal page, swipe and the map popup. The wording and
// bucket come from lib/deals/title-badge-model (Amy's title-category helper underneath).

const TONE_STYLE: Readonly<
  Record<TitleBadgeTone, { background: string; color: string }>
> = {
  green: { background: "var(--glo)", color: "var(--green)" },
  amber: { background: "var(--amber-lo)", color: "var(--amber-d)" },
  red: { background: "var(--rlo)", color: "var(--red)" },
  muted: { background: "var(--s2)", color: "var(--t3)" },
};

const SUB_CHIP_STYLE = {
  background: "var(--olo)",
  color: "var(--orange)",
};

export function TitleBadge({
  condition,
  damageType,
  titleSource,
  repairableEvidence,
  size = "sm",
  hideUnknown = false,
  className = "",
}: {
  condition?: string | null;
  damageType?: string | null;
  titleSource?: string | null;
  repairableEvidence?: boolean;
  size?: "sm" | "md";
  /** Skip the badge entirely when the title is unknown and there's no damage chip. */
  hideUnknown?: boolean;
  className?: string;
}) {
  const m = titleBadgeModel({
    condition,
    damageType,
    titleSource,
    repairableEvidence,
  });
  if (hideUnknown && m.category === "unknown" && !m.damage) return null;
  const pad =
    size === "md" ? "px-2.5 py-1 text-[11px]" : "px-2 py-0.5 text-[10px]";
  const chip = `rounded-[var(--r1)] ${pad} font-bold uppercase tracking-wide whitespace-nowrap`;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 ${className}`}
      data-title-category={m.category}
    >
      <span
        className={`${chip} ${m.weak ? "border border-dashed border-[var(--b2)] font-semibold" : ""}`}
        style={TONE_STYLE[m.tone]}
        title={m.hint}
        aria-label={`${m.label}. ${m.hint}`}
      >
        {m.label}
      </span>
      {m.partsOnly && (
        <span className={chip} style={SUB_CHIP_STYLE}>
          {PARTS_ONLY_LABEL}
        </span>
      )}
      {m.damage && (
        <span className={chip} style={SUB_CHIP_STYLE}>
          {TITLE_DAMAGE_LABELS[m.damage]}
        </span>
      )}
    </span>
  );
}
