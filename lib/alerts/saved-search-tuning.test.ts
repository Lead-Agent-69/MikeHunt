import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  matchesSavedSearch,
  precisionSuggestion,
} from "@/lib/alerts/saved-search-match";
import { digestEmailHtml } from "@/lib/alerts/saved-search-digest";

const deal = (over: any = {}) => ({
  make: "Ford",
  model: "F-150 XLT",
  year: 2018,
  ask_price: 20000,
  true_net_profit: 3000,
  deal_verdict: "go",
  lat: null,
  lng: null,
  ...over,
});
const search = (over: any = {}) => ({ make: "Ford", ...over });

describe("match precision", () => {
  it("standard keeps the original exact-model rule", () => {
    expect(matchesSavedSearch(deal(), search({ model: "F-150" }))).toBe(false);
    expect(
      matchesSavedSearch(deal({ model: "F-150" }), search({ model: "f-150" })),
    ).toBe(true);
  });

  it("looser matches longer model names and widens years by one", () => {
    const s = search({
      model: "F-150",
      min_year: 2019,
      match_precision: "looser",
    });
    expect(matchesSavedSearch(deal(), s)).toBe(true);
    expect(matchesSavedSearch(deal({ year: 2017 }), s)).toBe(false);
  });

  it("looser does not relax price or profit", () => {
    const s = search({ max_price: 15000, match_precision: "looser" });
    expect(matchesSavedSearch(deal(), s)).toBe(false);
  });

  it("tighter skips pass verdicts and implausible prices", () => {
    const s = search({ match_precision: "tighter" });
    expect(matchesSavedSearch(deal({ deal_verdict: "pass" }), search())).toBe(
      true,
    );
    expect(matchesSavedSearch(deal({ deal_verdict: "pass" }), s)).toBe(false);
    expect(
      matchesSavedSearch(
        deal({ deal_analysis: { priceImplausible: true } }),
        s,
      ),
    ).toBe(false);
  });

  it("tighter excludes unplaceable deals when a radius is set; standard lets them in", () => {
    const home = { lat: 38.6, lng: -90.2 };
    expect(
      matchesSavedSearch(deal(), search({ max_distance_miles: 50 }), home),
    ).toBe(true);
    expect(
      matchesSavedSearch(
        deal(),
        search({ max_distance_miles: 50, match_precision: "tighter" }),
        home,
      ),
    ).toBe(false);
  });

  it("unknown precision values behave as standard", () => {
    expect(
      matchesSavedSearch(
        deal(),
        search({ model: "F-150", match_precision: "wild" }),
      ),
    ).toBe(false);
  });
});

describe("precision suggestion from thumbs", () => {
  it("needs at least five ratings", () => {
    expect(
      precisionSuggestion([-1, -1, -1, -1], "standard").suggest,
    ).toBeNull();
  });
  it("mostly thumbs-down suggests one step tighter", () => {
    expect(precisionSuggestion([-1, -1, -1, 1, 1], "standard").suggest).toBe(
      "tighter",
    );
    expect(precisionSuggestion([-1, -1, -1, 1, 1], "looser").suggest).toBe(
      "standard",
    );
    expect(
      precisionSuggestion([-1, -1, -1, -1, -1], "tighter").suggest,
    ).toBeNull();
  });
  it("almost all thumbs-up on tighter suggests standard", () => {
    expect(precisionSuggestion([1, 1, 1, 1, 1], "tighter").suggest).toBe(
      "standard",
    );
    expect(precisionSuggestion([1, 1, 1, 1, 1], "standard").suggest).toBeNull();
  });
});

describe("digest", () => {
  it("escapes listing text and links only to our deal pages", () => {
    const html = digestEmailHtml(
      [
        {
          dealId: "a1b2",
          title: '<script>x</script> "Truck"',
          askPrice: 12000,
          location: "St. Louis, MO",
          searchName: "Trucks",
        },
      ],
      "https://mikehunt.app/",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("https://mikehunt.app/deal/a1b2");
    expect(html).toContain("once a day");
  });
});

describe("wiring", () => {
  const read = (p: string) => readFileSync(p, "utf8");
  it("pipeline uses the shared matcher and holds digest searches from instant sends", () => {
    const src = read("lib/scrapers/pipeline.ts");
    expect(src).toContain("matchesSavedSearch(");
    expect(src).toContain("!m.digest &&");
  });
  it("daily cron sends digests", () => {
    expect(read("app/api/alerts/process/route.ts")).toContain(
      "sendSavedSearchDigests(",
    );
  });
  it("alerts API falls back when the migration isn't applied", () => {
    expect(read("app/api/alerts/route.ts")).toContain('await inboxQuery("")');
  });
  it("UI copy doesn't claim learning or auto-tuning", () => {
    for (const f of [
      "components/searches/SearchTuning.tsx",
      "components/alerts/AlertFeedback.tsx",
    ]) {
      expect(read(f)).not.toMatch(
        /\b(learns?|learning|trains?|training|AI)\b|automatically (tune|adjust)/i,
      );
    }
  });
});
