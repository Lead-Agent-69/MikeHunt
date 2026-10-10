import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { notLiveLabel } from "@/components/shared/NotLiveLabel";

const HOUR = 3_600_000;
const ago = (h: number) => new Date(Date.now() - h * HOUR).toISOString();

describe("notLiveLabel (lib/deals/freshness on cards)", () => {
  it("is empty for a live row", () => {
    expect(notLiveLabel({ source: "carsforsale", lastSeenAt: ago(2) })).toBe(
      "",
    );
  });

  it("labels a stale row with its real age", () => {
    expect(
      notLiveLabel({ source: "carsforsale", lastSeenAt: ago(24 * 8) }),
    ).toBe("Last updated 8d ago, not live");
  });

  it("labels a frozen terms-gated row", () => {
    expect(notLiveLabel({ source: "copart", last_seen_at: ago(48) })).toBe(
      "Last updated 2d ago, not live",
    );
  });

  it("labels an ended auction from its real end time", () => {
    expect(notLiveLabel({ lastSeenAt: ago(1), auctionEndAt: ago(30) })).toMatch(
      /^Auction ended 1d ago, not live$/,
    );
  });

  it("shows nothing when the timestamp is missing — never 'just now' or 'unknown'", () => {
    expect(notLiveLabel({ source: "carsforsale" })).toBe("");
    expect(notLiveLabel({ source: "copart", lastSeenAt: null })).toBe("");
    // mapper turned a null into new Date(null) → 1970
    expect(notLiveLabel({ source: "copart", lastSeenAt: new Date(0) })).toBe(
      "",
    );
    expect(notLiveLabel(null)).toBe("");
  });

  it("prefers the API freshness field but still hides a missing-timestamp label", () => {
    expect(
      notLiveLabel({
        freshness: {
          state: "frozen",
          live: false,
          lastUpdatedAt: ago(24 * 3),
          ageHours: 72,
          gatedSource: "copart",
          label: "Last updated 3d ago, not live",
        },
      }),
    ).toBe("Last updated 3d ago, not live");
    expect(
      notLiveLabel({
        freshness: {
          state: "stale",
          live: false,
          lastUpdatedAt: null,
          ageHours: null,
          gatedSource: null,
          label: "Last update unknown, not live",
        },
      }),
    ).toBe("");
  });
});

describe("cards wired to the not-live label", () => {
  for (const file of [
    "components/scan/DealTable.tsx",
    "components/deal/SimilarDeals.tsx",
    "app/(dashboard)/arbitrage/page.tsx",
  ]) {
    it(file, () => {
      const src = readFileSync(file, "utf8");
      expect(src).toContain(
        'import { NotLiveLabel } from "@/components/shared/NotLiveLabel"',
      );
      expect(src).toContain("<NotLiveLabel deal=");
    });
  }

  it("arbitrage labels both opportunity and local rows", () => {
    const src = readFileSync("app/(dashboard)/arbitrage/page.tsx", "utf8");
    expect(src.match(/<NotLiveLabel deal=\{d\}/g)?.length).toBe(2);
  });

  it("the helper itself is untouched by this wiring (no just-now fallback added)", () => {
    const src = readFileSync("components/shared/NotLiveLabel.tsx", "utf8");
    expect(src).not.toContain("just now");
    expect(src).toContain('from "@/lib/deals/freshness"');
  });
});
