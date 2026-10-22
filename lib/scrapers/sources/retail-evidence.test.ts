import { describe, expect, it } from "vitest";
import {
  retailCardPriceEvidence,
  retailMileage,
  retailMoney,
  retailTitleCondition,
} from "./retail-evidence";
import { normalizeDeal } from "../tools/deal-normalizer";
import { sourcePriceContext } from "@/lib/deals/source-price-context";

const checkedAt = "2026-10-21T12:00:00Z";
describe("retail source evidence", () => {
  it.each([
    "Clean interior",
    "Rebuilt engine",
    "No salvage title",
    "No history of salvage title",
    "Clean title unknown",
    "Clean title?",
    "Clean title. Salvage title.",
    "Used vehicle",
    "Not running",
  ])("does not infer a title brand from %s", (text) => {
    expect(retailTitleCondition(text)).toBeUndefined();
  });
  it.each([
    ["Clean title", "clean_title"],
    ["Title: rebuilt", "rebuilt_title"],
    ["Salvage title", "salvage_title"],
    ["Parts only", "parts_only"],
  ])("retains the source-stated brand %s", (text, condition) => {
    expect(retailTitleCondition(text)).toBe(condition);
  });
  it.each([28000, "28,000", "$28,000.00", "US $28,000.00"])(
    "reads one complete amount %s",
    (value) => {
      expect(retailMoney(value)).toBe(28000);
    },
  );
  it.each([
    null,
    {},
    "",
    -28000,
    "-28000",
    "28,00",
    "$28,000 - $30,000",
    "$499/mo",
    "Call for price",
    "28k",
    Infinity,
    100_000_001,
  ])("rejects ambiguous or invalid money %s", (value) => {
    expect(retailMoney(value)).toBeUndefined();
  });
  it.each([undefined, null, "", "unknown", -1, "50-60k", "100 km"])(
    "does not turn unknown odometer %s into zero",
    (value) => {
      expect(retailMileage(value)).toBeUndefined();
    },
  );
  it("preserves explicit zero mileage all the way through deal normalization", () => {
    expect(retailMileage("60,000 miles")).toBe(60000);
    expect(
      normalizeDeal({
        source: "cars_com",
        title: "2021 Toyota Camry",
        mileage: retailMileage(0),
      }).mileage,
    ).toBe(0);
  });
  it("separates a cash amount from a down payment and unrelated payment advertising", () => {
    const result = retailCardPriceEvidence(
      "<p>Down payment: $999</p><p>Cash price: $18,000</p><p>$350/month</p>",
      999,
      checkedAt,
    );
    expect(result).toMatchObject({
      kind: "asking",
      askingPrice: 18000,
      listedAmount: 999,
      checkedAt,
    });
  });
  it.each([undefined, "", "not-a-date"])(
    "does not date an old source body from parsing time (%s)",
    (stamp) => {
      expect(
        retailCardPriceEvidence("Cash price: $18,000", 18000, stamp).kind,
      ).toBe("unknown");
    },
  );
  it("retains an old checkedAt so the comparison gate rejects it", () => {
    const evidence = retailCardPriceEvidence(
      "Cash price: $18,000",
      18000,
      "2026-01-01T00:00:00Z",
    );
    expect(
      sourcePriceContext(
        {
          source: "cars_com",
          source_url: "https://www.cars.com/vehicledetail/example/",
          ask_price: 18000,
          last_seen_at: checkedAt,
          price_evidence: evidence,
        },
        Date.parse(checkedAt),
      ).comparisonEligible,
    ).toBe(false);
  });
  it("rejects conflicting cash prices and ignores hidden script/template content", () => {
    expect(
      retailCardPriceEvidence(
        "Cash price: $18,000 Sale price: $19,000",
        18000,
        checkedAt,
      ).kind,
    ).toBe("unknown");
    expect(
      retailCardPriceEvidence(
        "<script>Cash price: $18,000</script><template>Sale price: $19,000</template>$999 down",
        999,
        checkedAt,
      ).kind,
    ).toBe("down_payment");
  });
  it("keeps MSRP and monthly payment terms out of cash comparisons", () => {
    expect(retailCardPriceEvidence("MSRP $28,000", 28000, checkedAt).kind).toBe(
      "reference",
    );
    expect(
      retailCardPriceEvidence("Monthly payment: $499", 499, checkedAt).kind,
    ).toBe("monthly_payment");
  });
});
