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
});
