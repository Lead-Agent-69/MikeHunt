import { describe, expect, it } from "vitest";
import {
  mayTouchDeferredObservation,
  sameSourceObservation,
} from "./source-observation";

const now = Date.parse("2026-10-19T06:00:00Z");
const stored = {
  source: "dealer",
  source_deal_id: "a",
  source_url: "https://dealer.example/a",
  active: true,
  ask_price: 18000,
  images: ["https://dealer.example/a.jpg"],
  vin: "VIN",
  condition: "clean_title",
  mileage: 50000,
  location_state: "MO",
  options: {
    priceEvidence: { kind: "asking", askingPrice: 18000, id: "proof-1" },
  },
  updated_at: "2026-10-17T06:00:00Z",
  last_seen_at: "2026-10-17T06:00:00Z",
  deal_analysis: { profit: 1000 },
  sell_estimate: 22000,
};
const fresh = () => ({
  ...stored,
  last_seen_at: new Date(now).toISOString(),
  deal_analysis: { profit: 500 },
  sell_estimate: 21000,
});

describe("verified source observations", () => {
  it("separates derived estimates from unchanged seller facts", () => {
    expect(sameSourceObservation(stored, fresh())).toBe(true);
    expect(mayTouchDeferredObservation(stored, fresh(), now)).toBe(true);
  });
  it.each([
    { ask_price: 3000 },
    { condition: "salvage_title" },
    { active: false },
    { vin: "OTHER" },
    { mileage: 80000 },
    { location_state: "IL" },
    { source_url: "https://dealer.example/b" },
    { images: ["https://dealer.example/new.jpg"] },
    {
      options: { priceEvidence: { kind: "down_payment", listedAmount: 18000 } },
    },
    {
      options: {
        priceEvidence: { kind: "asking", askingPrice: 18000, id: "proof-2" },
      },
    },
    { quality_flags: ["price_implausible"] },
    { new_unknown_fact: true },
  ])("never renews freshness for changed or unknown facts: %j", (patch) => {
    expect(
      mayTouchDeferredObservation(stored, { ...fresh(), ...patch }, now),
    ).toBe(false);
  });
  it.each([
    undefined,
    "invalid",
    "2026-10-18T06:00:00Z",
    "2026-10-20T06:00:00Z",
  ])("rejects stale or invalid observation time %s", (last_seen_at) => {
    expect(
      mayTouchDeferredObservation(stored, { ...fresh(), last_seen_at }, now),
    ).toBe(false);
  });
  it("requires a known row version, active inventory, and photo evidence", () => {
    expect(
      mayTouchDeferredObservation(
        { ...stored, updated_at: null },
        fresh(),
        now,
      ),
    ).toBe(false);
    expect(
      mayTouchDeferredObservation({ ...stored, active: false }, fresh(), now),
    ).toBe(false);
    expect(
      mayTouchDeferredObservation(
        { ...stored, images: [] },
        { ...fresh(), images: [] },
        now,
      ),
    ).toBe(false);
    const { source_url, ...incomplete } = fresh();
    expect(source_url).toContain("dealer.example");
    expect(mayTouchDeferredObservation(stored, incomplete, now)).toBe(false);
  });
});
