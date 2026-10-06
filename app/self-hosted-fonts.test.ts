import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("fonts are self-hosted", () => {
  const css = readFileSync("app/globals.css", "utf8");
  const layout = readFileSync("app/layout.tsx", "utf8");

  it("globals.css does not load Google Fonts", () => {
    expect(css).not.toContain("fonts.googleapis.com");
    expect(css).not.toContain("fonts.gstatic.com");
    expect(css).not.toMatch(/@import\s+url\(["']?https?:/);
  });

  it("layout loads Inter, Syne and Fraunces through next/font", () => {
    expect(layout).toContain(
      'import { Inter, Fraunces, Syne } from "next/font/google";',
    );
    for (const v of ["--font-sans", "--font-syne", "--font-serif"]) {
      expect(layout).toContain(`variable: "${v}"`);
    }
    expect(layout).toContain('axes: ["opsz"]');
  });

  it("the CSS font stacks use the next/font variables", () => {
    expect(css).toContain('--fn: var(--font-sans), "Inter"');
    expect(css).toMatch(/--fserif:\s*var\(--font-syne\), var\(--font-serif\)/);
  });
});
