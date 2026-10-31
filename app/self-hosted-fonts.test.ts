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

  it("layout loads licensed local variable fonts without build-time Google requests", () => {
    expect(layout).toContain('from "next/font/local"');
    expect(layout).not.toContain('from "next/font/google"');
    for (const family of ["Inter", "Syne", "Fraunces"]) {
      const asset = `app/fonts/${family.toLowerCase()}-latin.woff2`;
      expect(readFileSync(asset).subarray(0, 4).toString()).toBe("wOF2");
      expect(readFileSync(`app/fonts/${family}-OFL.txt`, "utf8")).toContain(
        "SIL OPEN FONT LICENSE",
      );
      expect(layout).toContain(`./fonts/${family.toLowerCase()}-latin.woff2`);
    }
    for (const v of ["--font-sans", "--font-syne", "--font-serif"]) {
      expect(layout).toContain(`variable: "${v}"`);
    }
  });

  it("the CSS font stacks use the next/font variables", () => {
    expect(css).toContain('--fn: var(--font-sans), "Inter"');
    expect(css).toMatch(/--fserif:\s*var\(--font-syne\), var\(--font-serif\)/);
  });
});
