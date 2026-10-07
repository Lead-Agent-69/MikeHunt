import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("mobile location regression protections", () => {
  const picker = readFileSync("components/shared/StatePicker.tsx", "utf8");
  const trigger = readFileSync("components/shared/MyStatesButton.tsx", "utf8");
  it("escapes the filtered header and keeps a scrollable viewport-height sheet", () => {
    expect(picker).toContain("createPortal");
    expect(picker).toContain("document.body");
    expect(picker).toContain("max-h-[92dvh]");
    expect(picker).toContain("min-h-0 flex-1 overflow-y-auto");
  });
  it("labels location selection, selection state and search", () => {
    expect(trigger).toContain("Choose location:");
    expect(trigger).toContain("minHeight: 44");
    expect(picker).toContain("aria-pressed={on}");
    expect(picker).toContain('aria-label="Search states"');
    expect(picker).toContain("aria-labelledby={titleId}");
  });
  it("supports dismissal, focus restoration and scoped initial selection", () => {
    expect(picker).toContain('event.key === "Escape"');
    expect(picker).toContain("previous?.focus()");
    expect(picker).toContain("initialStates ?? prefs.carsStates");
    expect(picker).toContain("controller.abort()");
  });
  it("does not acknowledge failed preference writes as success", () => {
    const prefs = readFileSync("hooks/usePreferences.ts", "utf8");
    expect(prefs).toContain(
      'if (!response.ok) throw new Error("Preferences could not be saved")',
    );
  });
  it("keeps Discover's location control in the header and avoids filter-only server navigation", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    const header = readFileSync("components/layout/TopNav.tsx", "utf8");
    expect(page).not.toContain("<SelectField");
    expect(page).not.toContain("<MarketPicker");
    expect(header).toContain("window.history.replaceState");
    expect(header).toContain("[pathname, searchParams]");
    expect(header).toMatch(/<Suspense\s+fallback=/);
    expect(header).toContain("<TopNavContent />");
    expect(page).toContain("savedStates.join");
    expect(page).toContain("...savedBuyerScope,");
  });
  it("offers scoped empty-state navigation and connection recovery", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain('label: "Try again", onClick: () => void mutate()');
    expect(page).toContain("router.replace");
    expect(page).toContain('aria-label="Buying for"');
    expect(page).not.toContain("href={`/scan");
    expect(page).toContain("matching vehicles");
    expect(page).not.toContain("mergedDuplicates.toLocaleString()");
    expect(page).toContain("(!discoverReady || isLoading) && !data");
  });
});
