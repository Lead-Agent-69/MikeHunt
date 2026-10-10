import { describe, expect, it } from "vitest";
import { getTitleRules, US_STATES } from "./titleRules";
describe("registration verification", () => {
  it.each(["TX", "CA", "WA", "NY", "FL"])(
    "does not assert eligibility or blanket inspection/permit deadlines for %s",
    (state) => {
      const guide = getTitleRules("TX", state);
      expect(guide.warning).toBe(true);
      expect(guide.note).toContain("does not establish eligibility");
      expect(guide.agencyUrl).toBe(
        "https://www.usa.gov/state-motor-vehicle-services",
      );
      expect(
        guide.requirements.every((item) => item.startsWith("Confirm")),
      ).toBe(true);
      expect(JSON.stringify(guide)).not.toMatch(
        /Clean Transfer|30 days|90-day|safety inspection required|wholesale license/,
      );
    },
  );
  it("retains all 50 selectable states", () => {
    expect(new Set(US_STATES).size).toBe(50);
  });
});
