/** Synthetic completed-evidence candidate; never imported into inventory. */
export function briefCandidate() {
  return {
    id: "deal-1",
    title: "2003 Honda Accord",
    year: 2003,
    make: "Honda",
    model: "Accord",
    vin: "1HGCM82633A004352",
    mileage: 0,
    source: "independent_dealer",
    source_url: "https://dealer.example/vehicles/accord",
    active: true,
    condition: "clean_title",
    title_source: "listing",
    last_seen_at: new Date().toISOString(),
    ask_price: 10000,
    price_evidence: { kind: "asking", askingPrice: 10000 },
    sell_estimate: 16000,
    recommended_max_bid: 10400,
    true_net_profit: 4100,
    deal_verdict: "go",
    deal_analysis: {
      costs: { repair: 500, transport: 200, selling: 500 },
      evidenceGates: {
        priceMeaningConfirmed: true,
        titleReviewed: true,
        conditionInspected: true,
        costsConfirmed: true,
      },
      valuation: {
        source: "comparables",
        confidence: "high",
        compCount: 5,
        soldLane: "clean",
        soldCount: 3,
        soldAnchored: true,
        soldAt: new Date().toISOString(),
      },
    },
  };
}
