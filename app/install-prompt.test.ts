import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INSTALL_PROMPT_DELAY_MS,
  isIOSDevice,
  isInstallPromptHiddenPath,
} from "@/components/InstallPrompt";

const source = readFileSync("components/InstallPrompt.tsx", "utf8");
const manifest = JSON.parse(readFileSync("public/manifest.json", "utf8")) as {
  id?: string;
  start_url: string;
  scope: string;
  display: string;
  icons: { src: string; sizes: string; purpose?: string }[];
  shortcuts: { url: string; description: string }[];
};

describe("install prompt", () => {
  it("detects iPhone and iPadOS (Mac + touch), not desktop Macs or Android", () => {
    expect(
      isIOSDevice({
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
      }),
    ).toBe(true);
    expect(
      isIOSDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      }),
    ).toBe(true);
    expect(
      isIOSDevice({
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        platform: "MacIntel",
        maxTouchPoints: 0,
      }),
    ).toBe(false);
    expect(
      isIOSDevice({
        userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8)",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      }),
    ).toBe(false);
  });

  it("stays off sign-in and onboarding screens", () => {
    for (const p of [
      "/login",
      "/register",
      "/reset-password",
      "/auth/callback",
      "/onboarding",
      "/onboarding/step-2",
    ]) {
      expect(isInstallPromptHiddenPath(p)).toBe(true);
    }
    for (const p of ["/discover", "/deal/abc", "/scan", "/", "/loginfo"]) {
      expect(isInstallPromptHiddenPath(p)).toBe(false);
    }
  });

  it("is dismissible, remembered, and waits before showing", () => {
    expect(source).toContain('aria-label="Dismiss install suggestion"');
    expect(source).toContain("writeFlag(INSTALL_DISMISSED_KEY)");
    expect(source).toContain('"appinstalled"');
    expect(INSTALL_PROMPT_DELAY_MS).toBeGreaterThanOrEqual(5000);
  });

  it("never blocks the page: only the card takes pointer events, tap targets are 44px", () => {
    expect(source).toContain("pointer-events-none fixed inset-x-0");
    expect(source).toContain("pointer-events-auto");
    expect(source).toContain("min-h-11 min-w-11");
    expect(source).not.toContain("rgba(15,15,20");
  });
});

describe("web app manifest", () => {
  it("has a stable id, standalone display and maskable + 192/512 icons", () => {
    expect(manifest.id).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url.startsWith(manifest.scope)).toBe(true);
    const sizes = manifest.icons.map((i) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("shortcut copy makes no real-time, AI or profit promises", () => {
    const text = manifest.shortcuts.map((s) => s.description).join(" | ");
    expect(text).not.toMatch(
      /real time|real-time|AI-powered|instantly|highest profit/i,
    );
  });
});
