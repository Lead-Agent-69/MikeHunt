import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deal page personal desk", () => {
  it("reads saved buyerMode and does not open personal buyers on the dealer lead", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    const store = readFileSync("lib/store/dealStore.ts", "utf8");

    expect(page).toContain("userTypeFromSavedBuyerMode");
    expect(page).toContain("readLocalBuyerIntent");
    expect(page).toContain("prefs.buyerScope?.buyerMode");
    expect(page).toContain("PersonalListingLead");
    expect(page).toContain("What to verify");
    expect(page).toContain("Asking price");
    expect(page).toContain("Original listing");
    expect(page).toContain('store.userType === "dealer"');
    expect(store).not.toMatch(/userType:\s*"dealer"/);
    expect(store).toContain('userType: "private"');
    expect(page).not.toContain("app/(dashboard)/scan/page.tsx");
  });
});
