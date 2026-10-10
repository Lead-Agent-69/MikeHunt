import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

// Route wiring for the buyer's home (lib/geo/buyer-home → for-you-rank / buyer-distance).
describe("route buyer-home wiring", () => {
  const discover = read("app/api/discover/route.ts");
  const forYou = read("app/api/reco/for-you/route.ts");

  it("discover resolves the home from prefs + the profile row it already fetched", () => {
    expect(discover).toContain("resolveBuyerHome({");
    expect(discover).toMatch(/home_zip, home_lat, home_lng/);
    expect(discover).toContain("compareFlip(a, b, buyerHome)");
    expect(discover).toContain("transportAdjustedProfit(d, buyerHome)");
    expect(discover).toContain(
      "comparePersonal(a, b, scope, makes, buyerHome)",
    );
    expect(discover).toContain("buyerDistanceFields(d, buyerHome)");
  });

  it("discover live preview never treats the ?state filter as the buyer's home", () => {
    expect(discover).not.toMatch(/homeState:\s*state\b/);
  });

  it("for-you cards carry the distance basis from saved prefs", () => {
    expect(forYou).toContain("buyerHomeFromPrefs(prefs)");
    expect(forYou).toContain("buyerDistanceFields(r.item.row, buyerHome)");
  });

  it("no route invents a TX/CA home for the ranking", () => {
    for (const src of [discover, forYou]) {
      expect(src).not.toMatch(/\|\|\s*["'](TX|CA)["']/);
    }
  });
});
