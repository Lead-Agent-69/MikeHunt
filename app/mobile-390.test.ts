import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");

describe("390px mobile layout", () => {
  it("entrance animations do not trap position:fixed bars inside the page", () => {
    const css = read("app/globals.css");
    for (const rule of [
      ".animate-fadeUp {\n  animation: fadeUp 0.4s var(--ease-out) backwards;",
      ".animate-scaleUp {\n  animation: scaleUp 0.3s var(--ease-out) backwards;",
      ".animate-slideUp {\n  animation: slideUp 0.3s var(--ease-out) backwards;",
      ".motion-enter {\n  animation: fadeUp 0.34s var(--ease-out) backwards;",
      ".stagger-children > * {\n  animation: fadeUp 0.34s var(--ease-out) backwards;",
    ]) {
      expect(css).toContain(rule);
    }
    expect(css).not.toMatch(/animation: (fadeUp|scaleUp|slideUp)[^;]* both;/);
  });

  it("the connection banner never blocks taps on the top nav", () => {
    const css = read("app/mobile.css");
    const rule = css.slice(css.indexOf(".connection-status-mobile {"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("pointer-events: none;");
  });

  it("state picker search is a 44px tap target", () => {
    expect(read("components/shared/StatePicker.tsx")).toContain(
      'className="min-h-11 min-w-0 flex-1 rounded-full',
    );
  });

  it("the map page does not double-pad at 390px", () => {
    expect(read("app/(dashboard)/map/page.tsx")).toContain(
      'className="max-w-6xl mx-auto md:px-4 py-6 space-y-4"',
    );
  });
});
