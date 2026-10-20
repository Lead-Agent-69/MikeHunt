import { describe, expect, it } from "vitest";
import { calibrationFromRows } from "@/lib/scoring/calibration";
import { completeSale } from "./ledger.fixture";
import type { LedgerRow } from "./ledger";
const samples = (overrides: LedgerRow = {}) =>
  Array.from({ length: 5 }, (_, i) =>
    completeSale({
      id: `record-${i}`,
      prediction_basis: "market_supported",
      prediction_captured_at: "2026-09-01T12:00:00Z",
      predicted_sell: 15000,
      predicted_transport: 300,
      predicted_recon: 800,
      predicted_profit: 2000,
      ...overrides,
    }),
  );
describe("personal learning evidence", () => {
  it("requires five complete sales with supported dated predictions", () => {
    expect(calibrationFromRows(samples().slice(0, 4))).toBeNull();
    for (const change of [
      { costs_complete: false },
      { actual_recon: null },
      { prediction_basis: "none" },
      { prediction_captured_at: "2026-10-02" },
    ])
      expect(calibrationFromRows(samples(change))).toBeNull();
  });
  it("counts each purchase once", () =>
    expect(calibrationFromRows(samples({ inventory_id: "same" }))).toBeNull());
  it("calculates paired adjustments from recomputed net, including zero costs", () => {
    expect(
      calibrationFromRows(
        samples({ actual_transport: 0, actual_profit: 999999 }),
      ),
    ).toMatchObject({
      sampleSize: 5,
      transportMultiplier: 0.5,
      reconMultiplier: 1.25,
      sellMultiplier: 1.07,
      matchedSamples: { sell: 5, transport: 5, recon: 5, profit: 5 },
    });
  });
  it("does not invent 100% accuracy without profit predictions", () => {
    expect(
      calibrationFromRows(samples({ predicted_profit: null })),
    ).toMatchObject({ profitAccuracyPct: null, profitBiasPct: null });
  });
  it("requires five pairs separately for each adjustment", () => {
    const rows = samples();
    rows[0].predicted_recon = null;
    expect(calibrationFromRows(rows)).toMatchObject({
      reconMultiplier: 1,
      matchedSamples: { recon: 4 },
    });
    expect(
      calibrationFromRows(
        samples({
          predicted_sell: null,
          predicted_transport: null,
          predicted_recon: null,
          predicted_profit: null,
        }),
      ),
    ).toBeNull();
  });
});
