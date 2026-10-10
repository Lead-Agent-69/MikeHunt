import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  humanizeEnumLabel,
  sellerTypeLabel,
  sourceLabel,
} from "@/lib/sources/source-meta";

const read = (path: string) => readFileSync(path, "utf8");

describe("raw DB enum labels never reach cards", () => {
  it("formatters turn enum values into human labels", () => {
    expect(sourceLabel("INDEPENDENT_DEALER")).toBe("Indie Dealer");
    expect(sourceLabel("independent_dealer")).toBe("Indie Dealer");
    expect(sourceLabel("ebay_motors")).toBe("eBay Motors");
    expect(sourceLabel("SOME_NEW_CHANNEL")).toBe("Some new channel");
    expect(sellerTypeLabel("private")).toBe("Private seller");
    expect(sellerTypeLabel("INDEPENDENT_DEALER")).toBe("Independent dealer");
    expect(humanizeEnumLabel("Copart")).toBe("Copart");
    expect(humanizeEnumLabel("independent_dealer")).toBe("Independent dealer");
    expect(humanizeEnumLabel("INDEPENDENT_DEALER")).toBe("Independent dealer");
    expect(humanizeEnumLabel("Rebuilt_title")).toBe("Rebuilt title");
    expect(humanizeEnumLabel("rebuilt-title")).toBe("Rebuilt title");
    expect(humanizeEnumLabel("Run And Drive")).toBe("Run And Drive");
  });

  it("Feed editorial cards use sourceLabel, not the raw source", () => {
    const feed = read("app/(dashboard)/feed/page.tsx");
    expect(feed).not.toContain("category: it.source ||");
    expect(feed).toContain("sourceLabel(it.source, it.sourceUrl)");
  });

  it("shared cards do not print raw source / seller enums", () => {
    for (const file of [
      "components/discovery/DiscoveryCard.tsx",
      "components/discovery/DiscoverHero.tsx",
      "components/deal/NextBestBuySpotlight.tsx",
    ]) {
      expect(read(file)).not.toMatch(/source\)?\.replace\(\/_\/g/);
      expect(read(file)).toContain("sourceLabel(");
    }
    expect(read("components/shared/DealCard.tsx")).toContain(
      "sellerTypeLabel(sellerType)",
    );
    expect(read("app/(dashboard)/alerts/page.tsx")).toContain(
      "sourceLabel(item.source)",
    );
    expect(read("components/deal/VinHistory.tsx")).toContain(
      "humanizeEnumLabel(s.condition)",
    );
    expect(read("app/(dashboard)/saved/page.tsx")).toContain(
      "sellerTypeLabel(item.sellerType)",
    );
  });
});
