import { describe, expect, it } from "vitest";
import { pendingDealerIntake } from "./pending-dealer-intake";

const now = Date.parse("2026-10-20T20:00:00Z");
const entry = (
  id: string,
  host = "billsmithauto.com",
  patch: Record<string, unknown> = {},
) => ({
  hash: id,
  synced: false,
  lastSeenAt: new Date(now).toISOString(),
  data: {
    source: "independent_dealer",
    source_deal_id: id,
    source_url: `https://${host}/vehicle/${id}`,
    year: 2020,
    make: "Honda",
    model: "Civic",
    ask_price: 10000,
    active: true,
    location_state: "IL",
    images: [`https://${host}/photos/car.jpg`],
    last_seen_at: new Date(now - 3600_000).toISOString(),
    ...patch,
  },
});

describe("pending dealer intake", () => {
  it("gives the buyer's primary market the first slot before surrounding states", () => {
    const entries = [
      entry("neighbour", "billsmithauto.com"),
      entry("home", "dgautollc.com", { location_state: "MO" }),
    ];
    expect(
      pendingDealerIntake(entries, ["MO", "IL"], 1, now).map(
        (row) => row.source_deal_id,
      ),
    ).toEqual(["home"]);
    expect(
      pendingDealerIntake(entries, ["IL", "MO"], 1, now).map(
        (row) => row.source_deal_id,
      ),
    ).toEqual(["neighbour"]);
  });
  it("preserves observation timestamps and gives small dealers a slot", () => {
    const entries = [
      entry("a1"),
      entry("a2"),
      entry("a3"),
      entry("b1", "x2builders.com"),
    ];
    const selected = pendingDealerIntake(entries, ["IL"], 3, now);
    expect(selected.map((row) => row.source_deal_id)).toEqual([
      "a1",
      "b1",
      "a2",
    ]);
    expect(selected[0].last_seen_at).toBe(entries[0].data.last_seen_at);
    expect(selected[0]).not.toBe(entries[0].data);
  });
  it("rejects stale, future, unavailable, unlocated, nonvehicle and photo-less snapshots", () => {
    const patches = [
      { last_seen_at: new Date(now - 25 * 3600_000).toISOString() },
      { last_seen_at: new Date(now + 1).toISOString() },
      { last_seen_at: undefined },
      { active: false },
      { location_state: "MO" },
      { location_state: undefined },
      { title: "2020 Honda boat", model: "Boat" },
      { images: [] },
      { options: { photoAudit: { state: "unavailable" } } },
      { images: ["https://billsmithauto.com/images/no-photo.jpg"] },
      { year: undefined },
      { model: undefined },
      { ask_price: 0 },
      { source: "carvana" },
      { source_url: "billsmithauto.com/vehicle/1" },
      { source_url: "https://user:password@billsmithauto.com/vehicle/1" },
      { source_url: "https://billsmithauto.com.evil.example/vehicle/1" },
      { source_url: "https://evil.example/vehicle/1?billsmithauto.com" },
      { ask_price: Number.POSITIVE_INFINITY },
      { year: 2099 },
      {
        options: {
          priceEvidence: { kind: "down_payment", listedAmount: 10000 },
        },
      },
      {
        options: {
          priceEvidence: { kind: "monthly_payment", listedAmount: 10000 },
        },
      },
      { deal_analysis: { priceImplausible: true } },
      { deal_analysis: { priceSanity: "typo" } },
    ];
    expect(
      pendingDealerIntake(
        patches.map((p, i) => entry(String(i), "billsmithauto.com", p)),
        ["IL"],
        25,
        now,
      ),
    ).toEqual([]);
  });
  it("requires a current registry host and excludes policy-blocked hosts even with operator restoration", () => {
    expect(
      pendingDealerIntake(
        [
          entry("a", "unregistered.example"),
          entry("b", "recar.com"),
          entry("c", "prosalvage.com"),
          { ...entry("synced"), synced: true },
        ],
        ["IL"],
        25,
        now,
      ),
    ).toEqual([]);
  });
  it("bounds intake and requires actual valid selected states", () => {
    const entries = Array.from({ length: 50 }, (_, i) => entry(String(i)));
    expect(pendingDealerIntake(entries, [], 25, now)).toEqual([]);
    expect(pendingDealerIntake(entries, ["XX"], 25, now)).toEqual([]);
    expect(pendingDealerIntake(entries, ["IL"], 999, now)).toHaveLength(25);
    expect(pendingDealerIntake(entries, ["IL"], 0, now)).toEqual([]);
    expect(pendingDealerIntake(entries, ["IL"], Number.NaN, now)).toEqual([]);
  });
});
