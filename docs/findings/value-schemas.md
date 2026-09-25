# Value Schemas Capture

[smartFetch] www.cars.com → solved via "stealth"
fetched via "stealth", 1659672B
ask price: $78433
findMarketValue() detected: nothing
value-ish fields in the listing JSON:
msrp = "80308"
price = "78433"

[smartFetch] www.truecar.com → solved via "static"
fetched via "static", 991900B
ask price: $32990
findMarketValue() detected: $32990
value-ish fields in the listing JSON:
pricing.listPrice = 32990
marketAnalysis.priceQuality = "EXCELLENT"

[smartFetch] www.autotrader.com → no tier passed; cooling down 10m
BLOCKED (no tier passed) — needs a cleaner IP.

### 3. AutoTrader.com

**Value Schema Fields discovered:**
AutoTrader's `__NEXT_DATA__` JSON includes detailed Kelley Blue Book (KBB) Fair Purchase Price (FPP) data for their listings, which acts as the market value comp.

Relevant fields from the listing JSON:

```json
{
  "pricingDetail": {
    "dealIndicator": "Great",
    "displayPrice": 9500,
    "kbbFppAmount": 10685,
    "kbbFppDelta": 1185,
    "kbbFppHighAmount": 11485,
    "kbbFppLowAmount": 9860,
    "noPriceLabel": "Contact Seller For Price",
    "priceValidUntil": "2025-11-01",
    "salePrice": 9500
  },
  "kbbVehicleId": 382444
}
```

**Recommendation for Claude:**

- Use `pricingDetail.kbbFppAmount` as the `options.marketValue` (this is the KBB Fair Purchase Price).
- Use `pricingDetail.dealIndicator` as the `options.priceRating` (e.g., "Great", "Good", "Fair").
- Use `pricingDetail.displayPrice` or `pricingDetail.salePrice` as the asking price.

**Integration status (2026-06-28):** the numeric `kbbFppAmount` is already harvested by the
schema-AGNOSTIC `findMarketValue()` (its `VALUE_KEY_RE` matches `kbb`/`fpp`); `kbbFppHigh/LowAmount`
straddle it so the robust median lands on the central FPP. Pinned by `extract-market-value.test.ts`
(AutoTrader `pricingDetail` shape → 10685, rejecting `msrp`/payment noise). No bespoke parser needed.
