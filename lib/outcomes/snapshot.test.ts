import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { outcomePredictionSnapshot } from "./snapshot";
const id = "c0110000-0000-4000-8000-000000000001";
function database(deal: unknown) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn(async () => ({ data: deal, error: null })),
  };
  return {
    client: { from: vi.fn(() => query) } as unknown as SupabaseClient,
    query,
  };
}
describe("outcome prediction snapshots", () => {
  it("does not create evidence from an unsupported resale estimate", async () => {
    const { client } = database({
      year: 2020,
      make: "Ford",
      model: "Escape",
      sell_estimate: 16000,
      true_net_profit: 4000,
      deal_analysis: { valuation: { source: "baseline" } },
    });
    expect(await outcomePredictionSnapshot(client, id)).toMatchObject({
      prediction_basis: "none",
      prediction_captured_at: null,
      predicted_sell: null,
      predicted_profit: null,
    });
  });
  it("captures only finite server values with supported market evidence", async () => {
    const { client, query } = database({
      year: 2020,
      make: "Ford",
      model: "Escape",
      sell_estimate: 16000,
      true_net_profit: 2000,
      deal_analysis: {
        valuation: {
          source: "comparables",
          resaleEvidence: true,
          compCount: 8,
          confidence: "medium",
          compKind: "ask",
        },
        costs: { transport: 300, repair: NaN },
      },
    });
    expect(await outcomePredictionSnapshot(client, id)).toMatchObject({
      prediction_basis: "market_supported",
      predicted_sell: 16000,
      predicted_profit: 2000,
      predicted_transport: 300,
      predicted_recon: null,
    });
    expect(query.eq).toHaveBeenCalledWith("id", id);
  });
  it("rejects invalid listing ids without a database call", async () => {
    const { client, query } = database(null);
    expect(await outcomePredictionSnapshot(client, "invalid")).toBeNull();
    expect(query.select).not.toHaveBeenCalled();
  });
});
