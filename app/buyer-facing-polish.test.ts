import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("buyer-facing polish", () => {
  it("keeps onboarding focused on buyer language instead of internal source ids", () => {
    const source = read("app/onboarding/page.tsx");

    expect(source).not.toContain("dealer.sourceId");
    expect(source).not.toContain("through exact dealer source IDs");
    expect(source).toContain("as priority sources for this buying scope");
    expect(source).toContain('source{plannedSourceCount === 1 ? "" : "s"}');
    expect(source).toContain(
      "window.setTimeout(() => controller.abort(), 25_000)",
    );
    expect(source).toContain("opening your matching scanner");
  });

  it("does not describe carousel mechanics in the Discover UI", () => {
    const source = read("app/(dashboard)/discover/page.tsx");

    expect(source).not.toContain("Drag or swipe to explore");
    expect(source).toContain("Live candidates for this scope");
  });

  it("shows source display names instead of raw registry ids in the smart-run copy", () => {
    const source = read("components/discovery/BuyerScopeBuilder.tsx");

    expect(source).toContain("formatSourceList(scrapePlan.sourceIds, 4)");
    expect(source).toContain("sourceMeta(sourceId).label");
    expect(source).not.toContain('scrapePlan.sourceIds.slice(0, 4).join(", ")');
  });

  it("uses the active device scope before an older cloud fallback", () => {
    const source = read("components/discovery/BuyerScopeBuilder.tsx");

    expect(source).toContain("const localScope = readLocalBuyerIntent()");
    expect(source).toContain("if (!localScope)");
    expect(source).toContain("let saved: any = localScope || {}");
  });

  it("shows source display names instead of raw registry ids in Scan proof copy", () => {
    const source = read("app/(dashboard)/scan/page.tsx");

    expect(source).toContain("sourceListText(plan.sourceIds)");
    expect(source).toContain("sourceMeta(sourceId).label");
    expect(source).not.toContain('plan.sourceIds.join(", ")');
    expect(source).not.toContain('importPlan.dealerSourceIds.join(", ")');
    expect(source).not.toContain('importPlan.mismatchedSourceIds.join(", ")');
  });

  it("keeps the Sources introduction focused on buyer decisions, not operations", () => {
    const source = read("app/(dashboard)/sources/page.tsx");

    expect(source).toContain("Market coverage");
    expect(source).toContain(
      "Choose where you want to find your next vehicle.",
    );
    expect(source).toContain("Live coverage available");
    expect(source).toContain("Available market coverage");
    expect(source).not.toContain(
      "Connect one lane, import rows, then Scan becomes useful.",
    );
    expect(source).not.toContain("Configure credentials");
    expect(source).not.toContain("Scraper Coverage");
  });
});
