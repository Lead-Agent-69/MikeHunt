import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { assertLocalTarget, localOnly } from "./support/target";

test.describe("source price evidence database contract", () => {
  localOnly();
  test("VIN comparison reads source price terms and dates through real PostgREST aliases", async ({
    request,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "One isolated local database verification is sufficient.",
    );
    assertLocalTarget("verify source price evidence fixtures");
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
      throw new Error("Database fixtures require local Supabase.");
    const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const vin = `1HGCM8263${randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
    const old = new Date(Date.now() - 8 * 86400000).toISOString();
    const cases = [
      {
        ask_price: 999,
        options: {
          description: "Cash price: $18,000",
          priceEvidence: { kind: "asking", askingPrice: 18000 },
        },
      },
      {
        ask_price: 20000,
        options: { priceEvidence: { kind: "asking", askingPrice: 20000 } },
      },
      {
        ask_price: 500,
        source: "copart",
        buy_now_price: 1000,
        auction_end_at: new Date().toISOString(),
        options: { priceEvidence: { kind: "current_bid", currentBid: 500 } },
      },
      {
        ask_price: 2000,
        options: {
          description: "Cash price: $2,000",
          priceEvidence: { kind: "asking", askingPrice: 2000, checkedAt: old },
        },
      },
      {
        ask_price: 299,
        options: {
          description: "Advertised price is a down payment",
          priceEvidence: { kind: "asking", askingPrice: 299 },
        },
      },
      { ask_price: 4000, options: {} },
      {
        ask_price: 25000,
        options: {
          price_is_acv_estimate: true,
          priceEvidence: { kind: "asking", askingPrice: 25000 },
        },
      },
    ];
    const rows = cases.map((fields) => {
      const id = randomUUID();
      return {
        id,
        source: "independent_dealer",
        source_deal_id: `local-price-evidence-${id}`,
        source_url: `https://seller.example/car/${id}`,
        title: "LOCAL QA source price evidence",
        year: 2020,
        make: "Honda",
        model: "Accord",
        condition: "clean_title",
        mileage: 50000,
        active: true,
        vin,
        last_seen_at: new Date().toISOString(),
        ...fields,
      };
    });
    const ids = rows.map((row) => row.id);
    try {
      expect((await db.from("deals").insert(rows)).error).toBeNull();
      const response = await request.get(`/api/deals/${ids[0]}/sources`);
      expect(response.ok()).toBe(true);
      const body = await response.json();
      expect(body).toMatchObject({
        count: 7,
        comparableCount: 2,
        cheapest: 18000,
        dearest: 20000,
        spread: 2000,
      });
      expect(body.base).toMatchObject({
        cashPrice: 18000,
        canCompareToAskingCurve: true,
      });
      const byId = new Map(body.sources.map((row: any) => [row.id, row]));
      expect(byId.get(ids[0])).toMatchObject({
        askPrice: 18000,
        priceContext: { advertisedAmount: 999 },
      });
      expect(byId.get(ids[2])).toMatchObject({
        askPrice: 500,
        priceContext: { comparisonEligible: false, observationCurrent: false },
      });
      expect(byId.get(ids[3])).toMatchObject({
        priceContext: { comparisonEligible: false, evidenceCurrent: false },
      });
      expect(byId.get(ids[4])).toMatchObject({
        priceContext: { kind: "down_payment", cashPrice: null },
      });
      expect(byId.get(ids[5])).toMatchObject({
        priceContext: { kind: "unknown", cashPrice: null },
      });
      expect(byId.get(ids[6])).toMatchObject({
        priceContext: { kind: "reference", cashPrice: null },
      });
    } finally {
      expect((await db.from("deals").delete().in("id", ids)).error).toBeNull();
      expect((await db.from("deals").select("id").in("id", ids)).data).toEqual(
        [],
      );
    }
  });
});
