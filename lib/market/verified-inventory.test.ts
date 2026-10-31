import { it, expect } from "vitest";
import {
  verifiedPulse,
  askingScatter,
  validVehicleTerm,
} from "./verified-inventory";
import { briefCandidate } from "@/lib/deals/__fixtures__/brief-candidate";
it("only current fully evidenced records enter profit summaries", () => {
  const good = { ...briefCandidate(), mileage: 10000, location_state: "MO" };
  const rows = [
    good,
    { ...good, last_seen_at: "2020-01-01" },
    { ...good, deal_analysis: {} },
    { ...good, price_evidence: { kind: "down_payment", listedAmount: 10000 } },
  ];
  expect(verifiedPulse(rows)).toMatchObject([
    { goDeals: 1, avgProfit: 4100, year: 2003, state: "MO" },
  ]);
});
it("keeps distinct years and states in separate evidence cohorts", () => {
  const row = briefCandidate();
  expect(
    verifiedPulse([
      { ...row, location_state: "MO" },
      { ...row, location_state: "IL" },
    ]),
  ).toHaveLength(2);
});
it("excludes unverified amounts and title defaults from asking-price plots", () => {
  const row = { ...briefCandidate(), mileage: 10000 };
  expect(
    askingScatter([
      row,
      { ...row, title_source: "source_default" },
      {
        ...row,
        price_evidence: { kind: "monthly_payment", listedAmount: 10000 },
      },
    ]),
  ).toHaveLength(1);
  expect(validVehicleTerm("Model 3")).toBe(true);
  expect(validVehicleTerm("Model%")).toBe(false);
});
