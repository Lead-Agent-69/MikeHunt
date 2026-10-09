import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("visor desk invent + soft-fail honesty", () => {
  it("map fetcher treats !ok as error and soft-fails with retry", () => {
    const page = read("app/(dashboard)/map/page.tsx");
    expect(page).toMatch(/if \(!response\.ok\) throw new Error/);
    expect(page).toContain("Map temporarily unavailable");
    expect(page).toContain("Try again");
    expect(page).not.toMatch(/live deal/i);
  });

  it("feed throws on !ok and soft-fails instead of empty success", () => {
    const page = read("app/(dashboard)/feed/page.tsx");
    expect(page).toMatch(
      /if \(!res\.ok \|\| data\.error \|\| data\.degraded\)/,
    );
    expect(page).toContain("setLoadError(true)");
    expect(page).toContain("Try again");
    expect(page).not.toMatch(/>\s*Live feed\s*</);
  });

  it("swipe soft-fails hard load without inventing an empty triage deck", () => {
    const page = read("app/(dashboard)/swipe/page.tsx");
    expect(page).toContain("if (!res.ok) throw new Error");
    expect(page).toContain("swipe-load-error");
    expect(page).toContain("Try again");
    expect(page).toContain("error && !data");
    expect(page).toContain("No saved-inventory listings are in the queue yet.");
  });

  it("auctions soft-fails list load and softens live-inventory toast", () => {
    const page = read("app/(dashboard)/auctions/page.tsx");
    expect(page).toContain("if (!res.ok) throw new Error");
    expect(page).toContain("Auction lists temporarily unavailable");
    expect(page).toContain("Try again");
    expect(page).toContain("matched against saved inventory");
    expect(page).not.toMatch(/matched against live inventory/i);
  });
});
