import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("recon page persona copy", () => {
  const page = read("app/(dashboard)/recon/page.tsx");

  it("gates back-lot dealer copy to flip desks", () => {
    expect(page).toContain("isFlipBuyerMode(intent?.buyerMode)");
    expect(page).toMatch(
      /flipDesk \? "Back-Lot Recon Tracker" : "Repair Tracker"/,
    );
    expect(page).toMatch(/flipDesk \? "Days on Lot" : "Days in Repair"/);
  });

  it("empty state is neutral, not good-news phrasing", () => {
    expect(page).not.toContain("Shop is clear!");
    expect(page).toContain("No vehicles in repair yet");
  });
});
