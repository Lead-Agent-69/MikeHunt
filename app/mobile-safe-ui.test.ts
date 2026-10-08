import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile fixed UI surfaces", () => {
  it("keeps scan toasts above the mobile bottom nav", () => {
    const scanPage = readFileSync("app/(dashboard)/scan/page.tsx", "utf8");

    expect(scanPage).toContain(
      "bottom-[calc(76px+env(safe-area-inset-bottom))]",
    );
    expect(scanPage).toContain("md:bottom-6");
    expect(scanPage).toContain("md:sticky md:top-4 md:z-20");
    expect(scanPage).not.toContain("items-center sticky top-4 z-20");
  });

  it("keeps the AI launcher out of mobile content and away from the tab bar", () => {
    const aiFeatures = readFileSync(
      "components/ui/next-level-features.tsx",
      "utf8",
    );
    const bottomNav = readFileSync("components/BottomNav.tsx", "utf8");

    expect(aiFeatures).toContain("hidden max-w-[calc(100vw-24px)]");
    expect(aiFeatures).toContain("md:flex");
    expect(aiFeatures).toContain("right-4 top-20");
    expect(aiFeatures).toContain("lg:top-auto lg:bottom-24");
    expect(aiFeatures).not.toContain("lg:bottom-6");
    expect(aiFeatures).toContain("open-mikehunt-copilot");
    expect(bottomNav).toContain("mobileNavForMode(intent?.buyerMode)");
    expect(bottomNav).toContain(
      'layoutId={reducedMotion ? undefined : "bottom-nav-active-pill"}',
    );
    expect(bottomNav).toContain('aria-current={isActive ? "page" : undefined}');
    expect(bottomNav).toContain("navigator.vibrate?.(8)");
    expect(bottomNav).toContain(
      "whileTap={reducedMotion ? undefined : { scale: 0.92 }}",
    );
    expect(bottomNav).not.toContain("Deal assistant");
    expect(bottomNav).not.toContain("open-mikehunt-copilot");
  });

  it("keeps the mobile app bar focused instead of duplicating desktop utilities", () => {
    const topNav = readFileSync("components/layout/TopNav.tsx", "utf8");
    const accountMenu = readFileSync("components/home/AccountMenu.tsx", "utf8");

    expect(topNav).toContain("md:hidden lg:block");
    expect(topNav).toContain("hidden items-center justify-end gap-2 md:flex");
    expect(topNav).toContain("flex items-center justify-end gap-2 md:hidden");
    expect(topNav).toContain("max-w-[88px]");
    expect(topNav).toContain("navItemIsActive(item, pathname)");
    expect(topNav).not.toContain("More dropdown");
    expect(accountMenu).toContain("LogOut");
    expect(accountMenu).not.toContain('router.push("/sources")');
    expect(accountMenu).not.toContain("⚙ Settings");
    expect(accountMenu).not.toContain("⎋ Log out");
  });

  it("verifies the app connection and renders only one offline surface", () => {
    const mobileUx = readFileSync("components/ui/mobile-ux.tsx", "utf8");
    const layout = readFileSync("app/layout.tsx", "utf8");

    expect(mobileUx).toContain('await fetch("/favicon.ico"');
    expect(mobileUx).not.toContain("navigator.onLine === false");
    expect(mobileUx).toContain(
      "const handleOffline = () => void verifyOnline()",
    );
    expect(layout).toContain("<NetworkStatusBanner />");
    expect(layout).not.toContain("<OfflineBanner />");
  });

  it("keeps feed chrome and the install nudge above the mobile tab bar", () => {
    const feedPage = readFileSync("app/(dashboard)/feed/page.tsx", "utf8");
    const installPrompt = readFileSync("components/InstallPrompt.tsx", "utf8");

    // Editorial showcase must not force a full-viewport interstitial over the feed.
    expect(feedPage).not.toContain("snap-start min-h-screen");
    expect(feedPage).toContain("pb-[calc(5rem+env(safe-area-inset-bottom))]");
    // Feed card actions + price block clear BottomNav (58px) + home indicator.
    expect(feedPage).toContain(
      "bottom-[calc(9rem+env(safe-area-inset-bottom))]",
    );
    expect(feedPage).toContain("pb-[calc(4.5rem+env(safe-area-inset-bottom))]");
    // Install nudge sits above the tab bar (same clearance family as PWARegister).
    expect(installPrompt).toContain(
      "bottom-[calc(72px+env(safe-area-inset-bottom))]",
    );
    expect(installPrompt).not.toContain("fixed inset-x-0 bottom-0 z-50");
  });
});
