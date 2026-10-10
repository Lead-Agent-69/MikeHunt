import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { titleBadgeHtml, titleBadgeModel } from "@/lib/deals/title-badge-model";

describe("Map title filter + pin popup badge", () => {
  it("popup badge HTML matches the shared TitleBadge wording", () => {
    const html = titleBadgeHtml(
      titleBadgeModel({
        condition: "parts_only",
        titleSource: "source_default",
      }),
    );
    expect(html).toContain("Salvage title (reported by source)");
    expect(html).toContain("Parts only");
    expect(titleBadgeHtml(titleBadgeModel({ condition: "flood" }))).toContain(
      "Flood damage",
    );
  });

  it("escapes HTML in popup text", () => {
    expect(
      titleBadgeHtml(titleBadgeModel({ condition: "clean_title" })),
    ).not.toContain("<script");
  });

  it("the map sends titleType to /api/deals/map and badges pins", () => {
    const page = readFileSync("app/(dashboard)/map/page.tsx", "utf8");
    expect(page).toContain("withTitleType(scopeQuery, titleFilter)");
    expect(page).toContain("/api/deals/map?${query}");
    const map = readFileSync("components/map/DealerMap.tsx", "utf8");
    expect(map).toContain("pinTitleBadge(p)");
  });
});
