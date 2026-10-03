import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) =>
  readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");

describe("MikeHunt brand assets", () => {
  it("uses the aviator identity in app chrome instead of the old generic mark", () => {
    const topNav = read("components/layout/TopNav.tsx");
    const logo = read("components/brand/MikeHuntLogo.tsx");

    expect(topNav).toContain("MikeHuntLogo");
    expect(topNav).not.toContain("BarChart3");
    expect(logo).toContain("MikeHunt aviator mark");
  });

  it("ships a matching blue PWA icon and theme color", () => {
    const layout = read("app/layout.tsx");
    const manifest = JSON.parse(read("public/manifest.json")) as {
      theme_color: string;
      background_color: string;
      icons: Array<{ src: string; purpose?: string }>;
    };
    const icon = read("public/icon.svg");

    expect(layout).toContain('themeColor: "#075BE8"');
    expect(layout).toContain('<meta name="theme-color" content="#075BE8" />');
    expect(manifest.theme_color).toBe("#075BE8");
    expect(manifest.background_color).toBe("#F6F8FB");
    expect(manifest.icons.some((entry) => entry.src === "/icon.svg")).toBe(
      true,
    );
    expect(icon).toContain("MikeHunt aviator app icon");
    expect(icon).toContain("#075BE8");
    expect(icon).not.toContain("#f25b9a");
  });
});
