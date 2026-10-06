import { describe, expect, it } from "vitest";
import {
  buildAffinityProfile,
  dwellWeight,
  facetsOf,
  freshnessScore,
  localityScore,
  priceBand,
  rankForYou,
  recencyFactor,
  scoreAffinity,
  similarPrompt,
  type SignalRow,
} from "./affinity";

const NOW = Date.parse("2026-10-06T12:00:00.000Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();
const daysAgo = (d: number) => hoursAgo(d * 24);

const accord = (
  id: string,
  at: string,
  kind = "open",
  extra = {},
): SignalRow => ({
  deal_id: id,
  kind,
  make: "Honda",
  model: "Accord",
  year: 2018,
  price: 14500,
  body: "Sedan",
  state: "TX",
  source: "cars_com",
  created_at: at,
  ...extra,
});

describe("signal weights and decay", () => {
  it("ignores bounces and caps long dwell", () => {
    expect(dwellWeight(2_000)).toBe(0);
    expect(dwellWeight(30_000)).toBe(1);
    expect(dwellWeight(10 * 60_000)).toBe(2);
  });

  it("halves every 30 days and boosts the current session", () => {
    expect(recencyFactor(hoursAgo(1), NOW)).toBeCloseTo(1.5, 2);
    expect(recencyFactor(daysAgo(30), NOW)).toBeCloseTo(0.5, 2);
    expect(recencyFactor("bad", NOW)).toBe(0);
  });

  it("buckets price and normalizes facets", () => {
    expect(priceBand(14500)).toBe("10000-15000");
    expect(priceBand(90000)).toBe("70000+");
    expect(priceBand(0)).toBeNull();
    expect(facetsOf({ make: "Land Rover", model: "Range Rover" }).model).toBe(
      "landrover|rangerover",
    );
  });
});

describe("affinity profile", () => {
  it("learns model affinity from distinct views with honest reasons", () => {
    const profile = buildAffinityProfile(
      [
        accord("a", hoursAgo(1)),
        accord("b", hoursAgo(2)),
        accord("c", daysAgo(3)),
      ],
      NOW,
    );
    const hit = scoreAffinity(
      { make: "Honda", model: "Accord", year: 2019, price: 15500, state: "TX" },
      profile,
    );
    const miss = scoreAffinity(
      { make: "Ford", model: "F-150", price: 42000, state: "WA" },
      profile,
    );
    expect(hit.affinity).toBeGreaterThan(0.5);
    expect(hit.reason).toBe("You looked at 3 Honda Accord");
    expect(miss.affinity).toBe(0);
  });

  it("counts one open per deal per day (reloads are not interest)", () => {
    const once = buildAffinityProfile([accord("a", hoursAgo(1))], NOW);
    const reloads = buildAffinityProfile(
      [
        accord("a", hoursAgo(1)),
        accord("a", hoursAgo(1.1)),
        accord("a", hoursAgo(1.2)),
      ],
      NOW,
    );
    expect(reloads.signalCount).toBe(once.signalCount);
  });

  it("dismiss pushes away and removes the listing", () => {
    const profile = buildAffinityProfile(
      [
        accord("a", hoursAgo(1), "dismiss"),
        accord("b", hoursAgo(1), "dismiss"),
      ],
      NOW,
    );
    expect(
      scoreAffinity({ make: "Honda", model: "Accord" }, profile).affinity,
    ).toBeLessThan(0);
    expect(profile.dismissedIds.has("a")).toBe(true);
  });
});

describe("rankForYou", () => {
  const profile = buildAffinityProfile(
    [
      accord("s1", hoursAgo(1)),
      accord("s2", hoursAgo(2)),
      accord("s3", hoursAgo(3), "save"),
    ],
    NOW,
  );
  const cand = (
    id: string,
    make: string,
    model: string,
    state = "TX",
    fresh = 1,
  ) => ({
    id,
    make,
    model,
    year: 2018,
    price: 14000,
    state,
    firstSeenAt: hoursAgo(fresh),
    quality: 60,
  });

  it("ranks matches first, drops dismissed, and fills ~1 in 7 slots with exploration", () => {
    const pool = [
      ...Array.from({ length: 10 }, (_, i) =>
        cand(`acc${i}`, "Honda", "Accord"),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        cand(`f${i}`, "Ford", "F-150", "TX", 2),
      ),
    ];
    const dismissed = buildAffinityProfile(
      [
        accord("s1", hoursAgo(1)),
        accord("s2", hoursAgo(2)),
        accord("s3", hoursAgo(3), "save"),
        accord("acc0", hoursAgo(1), "dismiss"),
      ],
      NOW,
    );
    const ranked = rankForYou(pool, dismissed, {
      now: NOW,
      homeState: "TX",
      limit: 14,
    });
    expect(ranked.map((r) => r.item.id)).not.toContain("acc0");
    expect(ranked[0].item.make).toBe("Honda");
    expect(ranked[0].reason).toMatch(/You looked at/);
    const explore = ranked.filter((r) => r.slot === "explore");
    expect(explore.length).toBe(2);
    expect(ranked[6].slot).toBe("explore");
    expect(explore[0].item.make).toBe("Ford");
    expect(explore[0].reason).toMatch(/different/);
  });

  it("prefers the home state over a search state over elsewhere", () => {
    expect(localityScore("TX", "TX", ["OK"])).toBe(1);
    expect(localityScore("OK", "TX", ["OK"])).toBe(0.7);
    expect(localityScore("CA", "TX", ["OK"])).toBe(0);
    expect(freshnessScore(hoursAgo(10), NOW)).toBe(1);
    expect(freshnessScore(daysAgo(20), NOW)).toBe(0);
  });

  it("no signals: no exploration labels and no invented reasons", () => {
    const empty = buildAffinityProfile([], NOW);
    const ranked = rankForYou([cand("x", "Ford", "F-150")], empty, {
      now: NOW,
    });
    expect(ranked[0].slot).toBe("match");
    expect(ranked[0].reason).toBeUndefined();
    expect(profile.signalCount).toBeGreaterThan(0);
  });
});

describe("similarPrompt", () => {
  it("asks after 3 distinct listings of one model in a day, citing the real count", () => {
    expect(
      similarPrompt([accord("a", hoursAgo(1)), accord("b", hoursAgo(2))], NOW),
    ).toBeNull();
    const p = similarPrompt(
      [
        accord("a", hoursAgo(1)),
        accord("b", hoursAgo(2)),
        accord("c", hoursAgo(3)),
      ],
      NOW,
    );
    expect(p).toMatchObject({
      facet: "model:honda|accord",
      basedOnListings: 3,
    });
    expect(p!.message).toBe(
      "You looked at 3 Honda Accord listings in the last day. Want more like these?",
    );
  });

  it("does not count short dwell, old views, or ask again after an answer", () => {
    const rows = [
      accord("a", hoursAgo(1), "dwell", { dwell_ms: 3_000 }),
      accord("b", hoursAgo(30)),
      accord("c", hoursAgo(2)),
      accord("d", hoursAgo(3)),
    ];
    expect(similarPrompt(rows, NOW)).toBeNull();
    const answered: SignalRow[] = [
      accord("a", hoursAgo(1)),
      accord("b", hoursAgo(2)),
      accord("c", hoursAgo(3)),
      {
        kind: "interest_no",
        facet: "model:honda|accord",
        created_at: daysAgo(2),
      },
    ];
    expect(similarPrompt(answered, NOW)).toBeNull();
  });

  it("an interest_yes answer teaches the model without a deal snapshot", () => {
    const p = buildAffinityProfile(
      [
        {
          kind: "interest_yes",
          facet: "model:honda|accord",
          created_at: hoursAgo(1),
        },
      ],
      NOW,
    );
    expect(
      scoreAffinity({ make: "Honda", model: "Accord" }, p).affinity,
    ).toBeGreaterThan(0);
  });
});
