import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("navigation usability", () => {
  const top = readFileSync("components/layout/TopNav.tsx", "utf8");
  const bottom = readFileSync("components/BottomNav.tsx", "utf8");
  const account = readFileSync("components/home/AccountMenu.tsx", "utf8");
  const layout = readFileSync("app/(dashboard)/layout.tsx", "utf8");

  it("uses tablet-safe breakpoints and reserves space for the bottom bar", () => {
    expect(top).toContain('aria-label="Primary desktop navigation"');
    expect(top).toContain("hidden lg:flex");
    expect(bottom).toContain("fixed bottom-0");
    expect(bottom).toContain("w-[100dvw] max-w-[100dvw]");
    expect(bottom).toContain(
      'top: "calc(100dvh - 58px - env(safe-area-inset-bottom))"',
    );
    expect(layout).toContain("md:pb-[calc(5rem+env(safe-area-inset-bottom))]");
    expect(layout).toContain("lg:pb-6");
  });

  it("does not inflate alerts or saved-vehicle counts with saved searches", () => {
    expect(top).not.toContain("useLocalSavedSearches");
    expect(top).toContain("undefined : alertCount");
    expect(bottom).not.toContain("useLocalSavedSearches");
    expect(bottom).toContain("const watchScopeCount = localSaved.count;");
    expect(bottom).toContain("saved on this device");
    expect(bottom).toContain('aria-hidden="true"');
    expect(bottom).toContain("aria-label={");
  });

  it("reserves desktop action widths instead of squeezing them into equal sides", () => {
    expect(top.match(/min-w-0 lg:flex-none/g)).toHaveLength(2);
    expect(top).toContain("shrink-0 lg:mx-auto");
    expect(top).toContain("gap-1.5 whitespace-nowrap");
  });

  it("respects reduced motion and keeps keyboard focus visible", () => {
    expect(top).toContain(
      'layoutId={reducedMotion ? undefined : "topnav-pill"}',
    );
    for (const source of [top, bottom, account]) {
      expect(source).toContain("focus-visible:outline");
      expect(source).toContain("min-h-11");
    }
    expect(account).not.toContain("group-open/tools:rotate-180");
    expect(account).toContain("All tools");
    expect(account).toContain("<ThemeToggle showLabel />");
    expect(account).toContain(
      "event.currentTarget.contains(event.relatedTarget)",
    );
    expect(readFileSync("next.config.js", "utf8")).toContain(
      "devIndicators: false",
    );
  });
});
