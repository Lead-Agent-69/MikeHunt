import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  isDismissalActive,
  isEngagedEnough,
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

  it("stays off sign-in, onboarding and screens with a verdict or primary action", () => {
    for (const p of [
      "/login",
      "/register",
      "/reset-password",
      "/auth/callback",
      "/onboarding",
      "/deal/abc",
      "/deal-check",
      "/swipe",
    ]) {
      expect(isInstallPromptHiddenPath(p)).toBe(true);
    }
    for (const p of [
      "/discover",
      "/scan",
      "/saved",
      "/",
      "/dealer-network",
      "/loginfo",
    ]) {
      expect(isInstallPromptHiddenPath(p)).toBe(false);
    }
  });

  it("never on the first visit: 2nd session or after a save/alert action", () => {
    expect(isEngagedEnough(1, false)).toBe(false);
    expect(isEngagedEnough(2, false)).toBe(true);
    expect(isEngagedEnough(1, true)).toBe(true);
    expect(source).toContain("export function markInstallEngagement()");
  });

  it("remembers a dismissal for 30 days (legacy flag still counts)", () => {
    const now = Date.UTC(2026, 9, 10);
    const day = 24 * 60 * 60 * 1000;
    expect(isDismissalActive(null, now)).toBe(false);
    expect(isDismissalActive("1", now)).toBe(true);
    expect(isDismissalActive(String(now - 29 * day), now)).toBe(true);
    expect(isDismissalActive(String(now - 31 * day), now)).toBe(false);
  });

  it("is a non-modal region, dismissable by a labelled 44px button and Escape", () => {
    expect(source).toContain('role="region"');
    expect(source).toContain('aria-label="Dismiss"');
    expect(source).toContain('e.key === "Escape"');
    expect(source).toContain('"appinstalled"');
    expect(source).not.toMatch(/\.focus\(/);
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
