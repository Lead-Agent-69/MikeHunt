import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (file: string) =>
  readFileSync(path.join(root, file), "utf8").replace(/^\uFEFF/, "");

describe("MikeHunt brand assets", () => {
  it("uses the supplied M identity in app chrome", () => {
    const topNav = read("components/layout/TopNav.tsx");
    const logo = read("components/brand/MikeHuntLogo.tsx");
    const mobileUx = read("components/ui/mobile-ux.tsx");

    expect(topNav).toContain("MikeHuntLogo");
    expect(topNav).not.toContain("BarChart3");
    expect(logo).toContain("/brand/MIKEHUNT-M.svg");
    expect(logo).not.toContain("aviator");
    expect(topNav).toContain('aria-label="MIKEHUNT home"');
    expect(mobileUx).toContain("MikeHuntLoader");
    expect(mobileUx).not.toContain('<path d="M3 13l2-2');
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
    expect(icon).toContain('aria-label="MIKEHUNT"');
    expect(read("public/brand/MIKEHUNT-M.svg")).toContain(
      "data:image/png;base64",
    );
  });

  it("keeps theme styling in CSS without per-logo observers or compressed lettering", () => {
    const logo = read("components/brand/MikeHuntLogo.tsx");
    expect(logo).not.toContain("MutationObserver");
    expect(logo).not.toContain("useEffect");
    expect(logo).not.toContain("tracking-tight");
    expect(logo).toContain("width={56}");
    expect(logo).toContain("height={56}");
    expect(read("components/brand/MikeHuntLogo.module.css")).toContain(
      '[data-theme="dark"]',
    );
  });

  it("uses the same preferences destination from account and tools without speculative tool prefetches", () => {
    const tools = read("app/(dashboard)/tools/page.tsx");
    expect(tools).toContain('href="/settings#buying-preferences"');
    expect(read("components/home/AccountMenu.tsx")).toContain(
      'href: "/settings#buying-preferences"',
    );
    expect(tools).toMatch(/href=\{entry.href\}\s+prefetch=\{false\}/);
    expect(tools).toContain('aria-label="Buying preferences"');
    expect(tools).toContain("disabled={!ready}");
  });
});
