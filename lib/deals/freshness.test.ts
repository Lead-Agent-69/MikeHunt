import { describe, expect, it } from "vitest";
import {
  dealFreshness,
  gatedSourceForRow,
  isFrozenDeal,
  isLiveDeal,
  sortLiveFirst,
} from "./freshness";

const NOW = Date.parse("2026-10-10T02:13:00Z");
const h = (n: number) => new Date(NOW - n * 3_600_000).toISOString();

describe("dealFreshness (eli audit 2026-10-09)", () => {
  it("an 8-day-old copart row is frozen, not live", () => {
    const l = dealFreshness(
      {
        source: "copart",
        sourceUrl: "https://www.copart.com/lot/1",
        lastSeenAt: "2026-10-02T03:14:56Z",
      },
      NOW,
    );
    expect(l.state).toBe("frozen");
    expect(l.live).toBe(false);
    expect(l.gatedSource).toBe("copart");
    expect(l.label).toBe("Last updated 8d ago, not live");
  });

  it("detects gated rows behind the shared gov_auction enum by URL", () => {
    expect(
      gatedSourceForRow({
        source: "gov_auction",
        sourceUrl: "https://www.govdeals.com/asset/1",
      }),
    ).toBe("govdeals");
    expect(
      gatedSourceForRow({
        source: "gov_auction",
        source_url: "https://www.publicsurplus.com/sms/x",
      }),
    ).toBe("publicsurplus");
    // GSA Auctions is reviewed and allowed.
    expect(
      gatedSourceForRow({
        source: "gov_auction",
        sourceUrl: "https://www.gsaauctions.gov/x",
      }),
    ).toBeNull();
  });

  it("a gated row re-seen within 24h (operator opt-in) is live", () => {
    expect(
      dealFreshness({ source: "copart", lastSeenAt: h(2) }, NOW).state,
    ).toBe("live");
  });

  it("a non-gated dealer row not seen in 72h is stale; recent is live", () => {
    const stale = dealFreshness(
      {
        source: "independent_dealer",
        sourceUrl: "https://aeofmiami.com/x",
        lastSeenAt: h(166),
      },
      NOW,
    );
    expect(stale.state).toBe("stale");
    expect(stale.label).toBe("Last updated 7d ago, not live");
    const live = dealFreshness(
      { source: "independent_dealer", lastSeenAt: h(2) },
      NOW,
    );
    expect(live).toMatchObject({ state: "live", live: true, label: "" });
  });

  it("an auction whose end time passed is ended", () => {
    const l = dealFreshness(
      { source: "gov_auction", lastSeenAt: h(1), auction_end_at: h(30) },
      NOW,
    );
    expect(l.state).toBe("ended");
    expect(l.label).toBe("Auction ended 1d ago, not live");
  });

  it("missing last_seen is never live", () => {
    expect(dealFreshness({ source: "independent_dealer" }, NOW)).toMatchObject({
      state: "stale",
      label: "Last update unknown, not live",
    });
  });
});

describe("sortLiveFirst", () => {
  it("keeps frozen rows visible but after live, stable within a tier", () => {
    const rows = [
      { id: "a", s: "frozen" as const },
      { id: "b", s: "live" as const },
      { id: "c", s: "stale" as const },
      { id: "d", s: "live" as const },
      { id: "e", s: "ended" as const },
    ];
    expect(sortLiveFirst(rows, (r) => r.s).map((r) => r.id)).toEqual([
      "b",
      "d",
      "c",
      "a",
      "e",
    ]);
  });
});

describe("isFrozenDeal / isLiveDeal", () => {
  it("works on raw DB rows and mapped deals", () => {
    const frozenRaw = {
      source: "gov_auction",
      source_url: "https://www.govdeals.com/asset/9",
      last_seen_at: "2026-10-06T03:14:20Z",
    };
    expect(isFrozenDeal(frozenRaw, NOW)).toBe(true);
    expect(isLiveDeal(frozenRaw, NOW)).toBe(false);
    const liveMapped = {
      source: "independent_dealer",
      sourceUrl: "https://www.recar.com/x",
      lastSeenAt: h(2),
    };
    expect(isFrozenDeal(liveMapped, NOW)).toBe(false);
    expect(isLiveDeal(liveMapped, NOW)).toBe(true);
    // Stale but not gated: not frozen, not live.
    const staleDealer = { source: "independent_dealer", lastSeenAt: h(100) };
    expect(isFrozenDeal(staleDealer, NOW)).toBe(false);
    expect(isLiveDeal(staleDealer, NOW)).toBe(false);
  });
});
