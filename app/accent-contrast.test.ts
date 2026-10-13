import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = postcss.parse(readFileSync("app/globals.css", "utf8"));
const tokens = (theme: "light" | "dark") => {
  const result: Record<string, string> = {};
  css.walkRules((rule) => {
    if (
      !rule.selectors.includes(":root") &&
      !rule.selectors.includes(`[data-theme="${theme}"]`)
    )
      return;
    rule.walkDecls((declaration) => {
      result[declaration.prop] = declaration.value;
    });
  });
  return result;
};
const luminance = (hex: string) => {
  expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
  return [1, 3, 5].reduce((sum, offset, index) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return (
      sum +
      [0.2126, 0.7152, 0.0722][index] *
        (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    );
  }, 0);
};
describe("paired accent and connection-notice colors", () => {
  for (const theme of ["light", "dark"] as const) {
    it.each([
      ["--accent", "--on-accent"],
      ["--red", "--on-status"],
      ["--green", "--on-status"],
    ])(
      `${theme} %s / %s meets normal-text contrast`,
      (background, foreground) => {
        const colors = tokens(theme);
        const a = luminance(colors[background]),
          b = luminance(colors[foreground]);
        expect(
          (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
        ).toBeGreaterThanOrEqual(4.5);
      },
    );
  }
});
