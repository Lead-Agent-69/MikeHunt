import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("app/(dashboard)/discover/page.tsx", "utf8");
const insights = page.slice(
  page.indexOf("Market insights and saved interests"),
  page.indexOf("</details>"),
);

describe("Discover market insights by buyer desk", () => {
  it("renders flip-economics widgets only for flip desks", () => {
    expect(insights).toContain(
      "{hasLiveListings && flipDesk && <EdgeBanner />}",
    );
    const flipBlock = insights.slice(
      insights.indexOf("{hasLiveListings && flipDesk && ("),
    );
    const flipBlockEnd = flipBlock.indexOf(")}");
    const gated = flipBlock.slice(0, flipBlockEnd);
    expect(gated).toContain("<NextBestBuySpotlight");
    expect(gated).toContain("<DiscoverHero");
    expect(gated).toContain("<MarketPulse");
    expect(insights).toMatch(
      /\{flipDesk && \(\s*<IntelRail\s+endpoint="\/api\/recommendations"/,
    );
  });

  it("keeps neutral market widgets for every desk", () => {
    expect(insights).toContain("<WatchedDealerFeed />");
    expect(insights).toContain("<DealTicker />");
    expect(insights).toContain("<MarketSummary />");
    expect(insights).toContain('title="Underpriced vs peers"');
  });

  it("only asks flip desks for a profit target", () => {
    expect(insights).toContain(
      '"Set your states and budget in Settings to get a “For You” rail tuned to how you buy."',
    );
  });
});
