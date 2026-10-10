/**
 * Map price/score pill text color. WCAG AA (4.5:1) for 12px bold text: white only reads on the
 * blue fill; the amber/green/teal/red fills take dark ink.
 */
const PILL_WHITE_TEXT = new Set(["#2563eb"]);

export const PILL_DARK_INK = "#0b1220";

export function pillTextColor(fill: string): string {
  return PILL_WHITE_TEXT.has(fill.toLowerCase()) ? "#fff" : PILL_DARK_INK;
}
