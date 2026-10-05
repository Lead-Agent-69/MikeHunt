import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("discover tailored rails by buyer mode", () => {
  it("hides flip rails for every non-flip desk, not only personal", () => {
    const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
    expect(page).toContain("isFlipBuyerMode");
    expect(page).toContain("hiddenNonFlipRails");
    expect(page).not.toContain('buyerMode === "personal"');
    // DIY and personal share the same non-flip hide set (includes salvage).
    expect(page).toContain('"roi"');
    expect(page).toContain('"salvage"');
    expect(page).toContain('"auctionLots"');
    // Parts keeps salvage / teardown, still drops wholesale flip rails.
    expect(page).toContain('buyerMode === "parts"');
    expect(page).toContain('? ["roi", "auctionLots", "fresh"]');
  });

  it("exposes parts as a real buyer mode that maps to the parts desk", () => {
    const intent = readFileSync("hooks/useBuyerIntent.ts", "utf8");
    const saved = readFileSync("lib/buyer/saved-buyer-mode.ts", "utf8");
    const onboarding = readFileSync("app/onboarding/page.tsx", "utf8");
    expect(intent).toContain('"parts"');
    expect(intent).toContain("Parts / teardown");
    expect(saved).toContain('mode === "parts"');
    expect(saved).toContain('return "parts"');
    expect(onboarding).toContain("parts:");
    expect(onboarding).toContain("For cores and teardown");
  });
});
