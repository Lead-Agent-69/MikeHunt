import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pillTextColor } from "./pillColors";

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.replace(/./g, (c) => c + c) : h;
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(full.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

describe("map pill contrast", () => {
  it.each(["#ef4444", "#f59e0b", "#2dd4bf", "#22c55e", "#2563eb"])(
    "%s pill text meets WCAG AA 4.5:1",
    (fill) => {
      expect(contrast(fill, pillTextColor(fill))).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("uses white only on blue", () => {
    expect(pillTextColor("#2563eb")).toBe("#fff");
    expect(pillTextColor("#f59e0b")).toBe("#0b1220");
  });

  it("pill markers use 12px text and a tap-friendly padding", () => {
    const src = readFileSync("components/map/DealerMap.tsx", "utf8");
    expect(src).toContain("font:700 12px/1 system-ui;padding:8px 10px");
    expect(src).toContain("color:${pillTextColor(color)}");
  });
});
