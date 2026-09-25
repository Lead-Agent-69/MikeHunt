export const VERDICT_STYLES: Record<
  string,
  { label: string; text: string; bg: string }
> = {
  // Display label BUY (internal verdict key stays "go" so scoring/stored data are untouched). BUY/HOLD/PASS
  // reads as a clear action to the user.
  go: { label: "BUY", text: "var(--green)", bg: "var(--glo)" },
  hold: { label: "HOLD", text: "var(--amber)", bg: "var(--amber-lo)" },
  pass: { label: "PASS", text: "var(--t4)", bg: "var(--s2)" },
};

export const SOURCE_COLORS: Record<string, { bg: string; text: string }> = {
  copart: { bg: "var(--blo)", text: "var(--blue)" },
  iaa: { bg: "var(--plo)", text: "var(--purple)" },
  craigslist: { bg: "var(--olo)", text: "var(--orange)" },
  facebook: { bg: "var(--blo)", text: "var(--blue)" },
  ebay: { bg: "var(--amber-lo)", text: "var(--amber)" },
  manheim: { bg: "var(--glo)", text: "var(--green)" },
  adesa: { bg: "var(--glo)", text: "var(--green)" },
  acv: { bg: "var(--glo)", text: "var(--green)" },
};

export function getSourceColor(source: string) {
  const key = source.toLowerCase().split(/[^a-z]/)[0];
  return SOURCE_COLORS[key] ?? { bg: "var(--s2)", text: "var(--t4)" };
}

export function getScoreColor(score: number) {
  if (score >= 80) return { text: "var(--green)", bg: "var(--glo)" };
  if (score >= 60) return { text: "var(--amber)", bg: "var(--amber-lo)" };
  return { text: "var(--red)", bg: "var(--rlo)" };
}

export function formatCondition(
  condition?: string,
  damageType?: string,
): string {
  if (damageType && condition) return `${damageType} / ${condition}`;
  if (damageType) return damageType;
  if (condition) return condition;
  return "Unknown";
}
