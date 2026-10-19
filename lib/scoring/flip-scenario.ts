/** Explicit what-if arithmetic. Missing inputs never become zero or a buy recommendation. */
export const SCENARIO_FIELDS = {
  purchase: {
    label: "Purchase price",
    help: "Full vehicle price or your proposed winning bid, before fees.",
  },
  resale: {
    label: "Resale price",
    help: "Your sale assumption, before selling fees.",
  },
  buyerFees: {
    label: "Buyer / auction fees",
    help: "Fixed fees, including broker, gate and documentation charges.",
  },
  buyerFeeRate: {
    label: "Buyer fee rate",
    help: "Additional percentage of the purchase price. Enter 0 if included above.",
    percent: true,
  },
  taxTitle: {
    label: "Tax, title and registration",
    help: "Your applicable total; tax and exemptions vary by buyer and location.",
  },
  repair: {
    label: "Repair and preparation",
    help: "Inspection, parts, labor, detailing and reconditioning.",
  },
  transport: {
    label: "Transport and pickup",
    help: "Shipping or your full pickup expense.",
  },
  holding: {
    label: "Holding and financing",
    help: "Total interest, storage, insurance and overhead for your planned holding period.",
  },
  sellingFees: {
    label: "Selling fees",
    help: "Fixed advertising, transaction and sale expenses.",
  },
  sellingFeeRate: {
    label: "Selling fee rate",
    help: "Additional percentage of resale. Enter 0 if included above.",
    percent: true,
  },
  otherCosts: {
    label: "Other costs / reserve",
    help: "Unlisted expenses and your allowance for surprises.",
  },
  targetProfit: {
    label: "Target net profit",
    help: "Your goal after all entered costs, before income tax.",
  },
} as const;

export type ScenarioField = keyof typeof SCENARIO_FIELDS;
export const scenarioFields = Object.keys(SCENARIO_FIELDS) as ScenarioField[];
export type ScenarioDraft = Record<ScenarioField, string>;
export type ScenarioInput = Partial<Record<ScenarioField, unknown>>;

export function emptyScenario(targetProfit?: number | null): ScenarioDraft {
  const draft = Object.fromEntries(
    scenarioFields.map((field) => [field, ""]),
  ) as ScenarioDraft;
  // A goal is a user preference, never evidence of a return.
  draft.targetProfit =
    typeof targetProfit === "number" &&
    Number.isFinite(targetProfit) &&
    targetProfit >= 0
      ? String(targetProfit)
      : "3000";
  return draft;
}

export type ScenarioMetrics = {
  totalCost: number;
  investedBeforeSale: number;
  buyerCost: number;
  sellingCost: number;
  profit: number;
  roiPct: number;
  marginPct: number;
  breakEvenResale: number;
  purchaseCeiling: number | null;
  targetMet: boolean;
  targetGap: number;
  stress: { label: string; resale: number; profit: number }[];
};

export type ScenarioResult = {
  status: "needs_inputs" | "invalid" | "complete";
  missing: ScenarioField[];
  errors: Partial<Record<ScenarioField, string>>;
  metrics: ScenarioMetrics | null;
  acquisitionReady: false;
};

const money = (cents: number) => Math.round(cents) / 100;

export function calculateFlipScenario(input: ScenarioInput): ScenarioResult {
  const missing: ScenarioField[] = [];
  const errors: ScenarioResult["errors"] = {};
  const values = {} as Record<ScenarioField, number>;
  for (const field of scenarioFields) {
    const raw = input[field];
    if (raw == null || (typeof raw === "string" && raw.trim() === "")) {
      missing.push(field);
      continue;
    }
    const text = typeof raw === "string" ? raw.trim() : String(raw);
    const value = Number(text);
    const rate = field === "buyerFeeRate" || field === "sellingFeeRate";
    const max = rate ? 100 : 100_000_000;
    if (
      (typeof raw !== "number" && typeof raw !== "string") ||
      !/^\d+(?:\.\d{1,2})?$/.test(text) ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > max ||
      ((field === "purchase" || field === "resale") && value === 0) ||
      (field === "sellingFeeRate" && value === 100)
    ) {
      errors[field] = rate
        ? `Enter a percentage from 0 to ${field === "sellingFeeRate" ? "99.99" : "100"}.`
        : `Enter ${field === "purchase" || field === "resale" ? "a positive amount" : "0 or a positive amount"} up to $100,000,000, with at most two decimals.`;
    } else values[field] = Math.round(value * 100);
  }
  const base = { missing, errors, acquisitionReady: false as const };
  if (Object.keys(errors).length)
    return { ...base, status: "invalid", metrics: null };
  if (missing.length) return { ...base, status: "needs_inputs", metrics: null };

  // All money is cents. Rates are hundredths of a percent, so divide by 10,000.
  const v = values;
  const fixed =
    v.buyerFees +
    v.taxTitle +
    v.repair +
    v.transport +
    v.holding +
    v.otherCosts;
  const buyerCost =
    v.buyerFees + Math.round((v.purchase * v.buyerFeeRate) / 10000);
  const investedBeforeSale =
    v.purchase + fixed + Math.round((v.purchase * v.buyerFeeRate) / 10000);
  const sellingCost =
    v.sellingFees + Math.round((v.resale * v.sellingFeeRate) / 10000);
  const totalCost = investedBeforeSale + sellingCost;
  const profit = v.resale - totalCost;
  const saleNetRate = 1 - v.sellingFeeRate / 10000;
  let breakEven = Math.ceil((investedBeforeSale + v.sellingFees) / saleNetRate);
  // Fee rounding must not turn a displayed break-even into a one-cent loss.
  while (
    breakEven -
      Math.round((breakEven * v.sellingFeeRate) / 10000) -
      v.sellingFees <
    investedBeforeSale
  )
    breakEven++;
  let ceiling = Math.floor(
    (v.resale - sellingCost - fixed - v.targetProfit) /
      (1 + v.buyerFeeRate / 10000),
  );
  while (
    ceiling >= 0 &&
    v.resale -
      sellingCost -
      fixed -
      ceiling -
      Math.round((ceiling * v.buyerFeeRate) / 10000) <
      v.targetProfit
  )
    ceiling--;
  const stress = (label: string, resale: number, extraHolding: number) => ({
    label,
    resale: money(resale),
    profit: money(
      resale -
        investedBeforeSale -
        extraHolding -
        v.sellingFees -
        Math.round((resale * v.sellingFeeRate) / 10000),
    ),
  });
  return {
    ...base,
    status: "complete",
    metrics: {
      totalCost: money(totalCost),
      investedBeforeSale: money(investedBeforeSale),
      buyerCost: money(buyerCost),
      sellingCost: money(sellingCost),
      profit: money(profit),
      roiPct: (profit / totalCost) * 100,
      marginPct: (profit / v.resale) * 100,
      breakEvenResale: money(breakEven),
      purchaseCeiling: ceiling > 0 ? money(ceiling) : null,
      targetMet: profit >= v.targetProfit,
      targetGap: money(profit - v.targetProfit),
      stress: [
        stress("Your resale assumption", v.resale, 0),
        stress("Resale 10% lower", Math.round(v.resale * 0.9), 0),
        stress(
          "Resale 10% lower + holding cost doubled",
          Math.round(v.resale * 0.9),
          v.holding,
        ),
      ],
    },
  };
}

/** Saved drafts are scoped to an account and listing by the caller; they never change listing proof. */
export function readScenarioDraft(
  raw: string | null,
): { draft: ScenarioDraft; savedAt: string } | null {
  if (!raw || raw.length > 8000) return null;
  try {
    const data = JSON.parse(raw);
    if (
      data?.version !== 1 ||
      !data.draft ||
      typeof data.savedAt !== "string" ||
      !Number.isFinite(Date.parse(data.savedAt))
    )
      return null;
    const draft = {} as ScenarioDraft;
    for (const field of scenarioFields) {
      const value = data.draft[field];
      if (typeof value !== "string" || value.length > 32) return null;
      draft[field] = value;
    }
    if (calculateFlipScenario(draft).status === "invalid") return null;
    return { draft, savedAt: data.savedAt };
  } catch {
    return null;
  }
}
