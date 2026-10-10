// What the title badge says for one listing. Pure (no React) so cards, the deal page, the map
// popup and tests share one read.
//
// - The bucket comes ONLY from Amy's helper (`titleCategoryDetail`, deals.condition). Listing-title
//   text ("Clean Carfax") is never read, so nothing is upgraded to Clean from copy.
// - A clean claim next to repair evidence reads "Title unconfirmed" (#195's title-signal rule).
// - A title the source stamped by default (options.titleSource = "source_default") is a weaker
//   claim than one the listing states, so it reads "… (reported by source)" in a muted style.
// - Flood/fire/hail get a damage chip; parts_only is Salvage with a "Parts only" sub-chip.
import {
  parseTitleTypes,
  titleCategoryDetail,
  TITLE_CATEGORY_CONDITIONS,
  TITLE_CATEGORY_LABELS,
  type TitleCategory,
  type TitleDamageChip,
} from "@/lib/deals/title-category";
import {
  cleanTitleConflicts,
  TITLE_UNCONFIRMED_LABEL,
} from "@/lib/intelligence/title-signal";

export type TitleSource = "listing" | "source_default";

export type TitleBadgeTone = "green" | "amber" | "red" | "muted";

export type TitleBadgeModel = {
  category: TitleCategory;
  label: string;
  tone: TitleBadgeTone;
  /** Source-default title: weaker claim, muted style. */
  weak: boolean;
  /** Clean claim downgraded by repair evidence. */
  unconfirmed: boolean;
  partsOnly: boolean;
  damage: TitleDamageChip | null;
  /** Hover/aria explanation. */
  hint: string;
};

export const TITLE_DAMAGE_LABELS: Readonly<Record<TitleDamageChip, string>> = {
  flood: "Flood damage",
  fire: "Fire damage",
  hail: "Hail damage",
};

export const PARTS_ONLY_LABEL = "Parts only";
export const REPORTED_BY_SOURCE = "(reported by source)";

const TONES: Readonly<Record<TitleCategory, TitleBadgeTone>> = {
  clean: "green",
  rebuilt: "amber",
  salvage: "red",
  rebuildable: "amber",
  unknown: "muted",
};

function damageFrom(
  detailDamage: TitleDamageChip | null,
  damageType?: string | null,
): TitleDamageChip | null {
  if (detailDamage) return detailDamage;
  const text = String(damageType || "").toLowerCase();
  if (/\bflood|water\b/.test(text)) return "flood";
  if (/\bfire|burn/.test(text)) return "fire";
  if (/\bhail\b/.test(text)) return "hail";
  return null;
}

const HTML_TONES: Readonly<Record<TitleBadgeTone, [string, string]>> = {
  green: ["#dcfce7", "#15803d"],
  amber: ["#fef3c7", "#b45309"],
  red: ["#fee2e2", "#b91c1c"],
  muted: ["#f1f1f1", "#555555"],
};

const escHtml = (v: unknown) =>
  String(v ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );

/** The same badge as an HTML string, for Leaflet popups (map pins). */
export function titleBadgeHtml(model: TitleBadgeModel): string {
  const chip = (text: string, [bg, fg]: [string, string], dashed = false) =>
    `<span style="display:inline-block;margin:4px 4px 0 0;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;background:${bg};color:${fg}${dashed ? ";border:1px dashed #bbb" : ""}">${escHtml(text)}</span>`;
  const sub: [string, string] = ["#ffedd5", "#c2410c"];
  return `<div title="${escHtml(model.hint)}">${chip(model.label, HTML_TONES[model.tone], model.weak)}${
    model.partsOnly ? chip(PARTS_ONLY_LABEL, sub) : ""
  }${model.damage ? chip(TITLE_DAMAGE_LABELS[model.damage], sub) : ""}</div>`;
}

/**
 * Older saved snapshots store a title bucket ("salvage", "clean_title") instead of the enum.
 * Accept exact enum values or bucket tokens only (never free listing text), mapped to the
 * bucket's first enum value so the badge reads the same as on a live card.
 */
export function conditionFromTitleType(value?: string | null): string | null {
  const [category] = parseTitleTypes(value);
  if (!category || category === "unknown") return null;
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (TITLE_CATEGORY_CONDITIONS[category].includes(raw as never)) return raw;
  return TITLE_CATEGORY_CONDITIONS[category][0] ?? null;
}

export function normalizeTitleSource(value: unknown): TitleSource | null {
  return value === "listing" || value === "source_default" ? value : null;
}

export function titleBadgeModel(input: {
  condition?: string | null;
  damageType?: string | null;
  titleSource?: string | null;
  /** Decision-guard verdict (deal page) that the car is repairable. */
  repairableEvidence?: boolean;
}): TitleBadgeModel {
  const detail = titleCategoryDetail({ condition: input.condition });
  const damage = damageFrom(detail.damage, input.damageType);
  const source = normalizeTitleSource(input.titleSource);
  const unconfirmed =
    detail.category === "clean" &&
    cleanTitleConflicts("clean_title", {
      condition: input.condition,
      damageType: input.damageType,
      repairableEvidence: input.repairableEvidence,
    });
  const weak = source === "source_default" && detail.category !== "unknown";
  const base = unconfirmed
    ? TITLE_UNCONFIRMED_LABEL
    : TITLE_CATEGORY_LABELS[detail.category];
  const label = weak ? `${base} ${REPORTED_BY_SOURCE}` : base;
  const tone: TitleBadgeTone = unconfirmed
    ? "amber"
    : weak
      ? "muted"
      : TONES[detail.category];
  const hint = unconfirmed
    ? "The listing claims a clean title, but its condition or damage says repairable. Verify the title before buying."
    : weak
      ? "This source labels every listing this way by default; the listing itself doesn't state the title. Verify before buying."
      : detail.category === "unknown"
        ? "The listing doesn't state a title status. Verify before buying."
        : "Listing-reported title status. Verify the actual title before buying.";
  return {
    category: detail.category,
    label,
    tone,
    weak,
    unconfirmed,
    partsOnly: detail.partsOnly,
    damage,
    hint,
  };
}
