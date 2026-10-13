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

  it("keeps the decision guide accessible without covering vehicle content", () => {
    const aiFeatures = readFileSync(
      "components/ui/next-level-features.tsx",
      "utf8",
    );
    const bottomNav = readFileSync("components/BottomNav.tsx", "utf8");

    const accountMenu = readFileSync("components/home/AccountMenu.tsx", "utf8");
    const overlays = readFileSync(
      "components/layout/DashboardOverlays.tsx",
      "utf8",
    );
    expect(accountMenu).toContain("Decision guide");
    expect(accountMenu).toContain('new Event("open-mikehunt-copilot")');
    expect(overlays).toContain("initialOpen={guideRequested}");
    expect(overlays).toContain("guideRequested &&");
    expect(aiFeatures).not.toContain("Floating Launcher Button");
    expect(aiFeatures).toContain("<Dialog.Content");
    expect(aiFeatures).toContain('aria-label="Message for decision guide"');
    expect(aiFeatures).toContain("open-mikehunt-copilot");
    expect(bottomNav).toContain("mobileNavForMode(intent?.buyerMode)");
    expect(bottomNav).toContain("prefetch={false}");
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

    expect(topNav).toContain("lg:hidden xl:block");
    expect(topNav).toContain("hidden items-center justify-end gap-2 lg:flex");
    expect(topNav).toContain("flex items-center justify-end gap-2 lg:hidden");
    expect(topNav).toContain("max-w-[88px]");
    expect(topNav).toContain("navItemIsActive(item, pathname)");
    expect(topNav).toContain("prefetch={false}");
    expect(topNav).not.toContain("More dropdown");
    expect(accountMenu).toContain("LogOut");
    expect(accountMenu).toContain(
      "max-h-[calc(100dvh-128px-env(safe-area-inset-bottom))]",
    );
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

  it("reserves document space for connection status instead of covering navigation", () => {
    const css = readFileSync("app/mobile.css", "utf8");
    const rule = css.match(/\.connection-status-mobile \{([^}]+)\}/)![1];
    expect(rule).toContain("position: relative");
    expect(rule).toContain("env(safe-area-inset-top)");
    expect(rule).not.toMatch(/fixed|absolute|transform|z-index/);
    const page = readFileSync("app/(dashboard)/save/page.tsx", "utf8");
    expect(page).not.toContain("text-[var(--on-accent)]");
    const mobileUx = readFileSync("components/ui/mobile-ux.tsx", "utf8");
    expect(mobileUx).toContain(
      "Connection unavailable. Some features may be limited.",
    );
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
    expect(installPrompt).toContain("z-20");
    expect(installPrompt).not.toContain("z-[60]");
  });
});
