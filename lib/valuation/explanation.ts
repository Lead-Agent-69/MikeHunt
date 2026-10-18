export type ValuationInputs = {
  asOf?: string;
  source?: string;
  compCount?: number;
  soldCount?: number;
  cleanComp?: number | null;
  baseline?: number;
  mileageMult?: number;
  titleMult?: number;
  compScope?: string;
  compKind?: string;
  compExcludedSelf?: number;
  resaleEvidence?: boolean;
};

/** Only recorded calculation inputs; no private contact blobs or inferred platform counts. */
export function valuationInputs(raw: unknown): ValuationInputs | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const data = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof data.asOf === "string" && Number.isFinite(Date.parse(data.asOf)))
    out.asOf = new Date(data.asOf).toISOString();
  for (const key of [
    "compCount",
    "soldCount",
    "cleanComp",
    "baseline",
    "mileageMult",
    "titleMult",
    "compExcludedSelf",
  ]) {
    if (
      typeof data[key] === "number" &&
      Number.isFinite(data[key]) &&
      data[key] >= 0
    )
      out[key] = data[key];
  }
  const enums = {
    source: [
      "comparables",
      "third_party",
      "historical_estimate",
      "asking_price",
      "baseline",
    ],
    compScope: ["state", "national", "index", "none"],
    compKind: ["sold", "ask", "none"],
  };
  for (const [key, values] of Object.entries(enums)) {
    if (typeof data[key] === "string" && values.includes(data[key] as string))
      out[key] = data[key];
  }
  if (typeof data.resaleEvidence === "boolean")
    out.resaleEvidence = data.resaleEvidence;
  return Object.keys(out).length ? (out as ValuationInputs) : undefined;
}

export function valuationExplanation(input?: ValuationInputs) {
  const v = valuationInputs(input) || {};
  const money = (value?: number | null) =>
    value != null && value > 0
      ? `$${Math.round(value).toLocaleString("en-US")}`
      : "Not recorded";
  const adjustment = (mult?: number) =>
    mult != null && mult > 0
      ? `${Math.round((mult - 1) * 100)}% (x${mult.toFixed(3)})`
      : "Not recorded";
  const scopes: Record<string, string> = {
    state: "Same state",
    national: "National",
    index: "Listing index",
    none: "No comparable market",
  };
  const sources: Record<string, string> = {
    comparables: "Comparable observations",
    third_party: "Attached market guide",
    historical_estimate: "Historical model",
    asking_price: "This listing's asking price",
    baseline: "Offline baseline",
  };
  return [
    ["Estimate basis", sources[v.source || ""] || "Not recorded"],
    [
      "Calculated at",
      v.asOf
        ? new Date(v.asOf).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC"
        : "Not recorded",
    ],
    [
      "Comparable observations",
      v.compCount == null ? "Not recorded" : String(v.compCount),
    ],
    [
      "Comparable price type",
      v.compKind === "sold"
        ? "Recorded sales"
        : v.compKind === "ask"
          ? "Seller asking prices, not sales"
          : "Not recorded",
    ],
    ["Market scope", scopes[v.compScope || ""] || "Not recorded"],
    ["Comparable reference price", money(v.cleanComp)],
    ["Mileage adjustment", adjustment(v.mileageMult)],
    ["Title / condition adjustment", adjustment(v.titleMult)],
    [
      "Self matches excluded",
      v.compExcludedSelf == null ? "Not recorded" : String(v.compExcludedSelf),
    ],
    [
      "Sold observations recorded",
      v.soldCount == null ? "Not recorded" : String(v.soldCount),
    ],
    [
      "Enough independent value evidence",
      v.resaleEvidence === true
        ? "Yes, according to the recorded model"
        : v.resaleEvidence === false
          ? "No"
          : "Not recorded",
    ],
  ];
}
