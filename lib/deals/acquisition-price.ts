type PriceRow = {
  source?: string;
  seller_type?: string | null;
  sellerType?: string | null;
  title?: string | null;
  description?: string | null;
  ask_price?: unknown;
  askPrice?: unknown;
  buy_now_price?: unknown;
  buyNowPrice?: unknown;
  metadata?: Record<string, unknown> | null;
  options?: Record<string, any> | null;
};

export type PriceEvidence = {
  kind:
    | "asking"
    | "down_payment"
    | "monthly_payment"
    | "finance_teaser"
    | "current_bid"
    | "buy_now"
    | "reference"
    | "unknown";
  askingPrice?: number;
  listedAmount?: number;
  evidenceText?: string;
  checkedAt?: string;
  currentBid?: number;
  buyNow?: number;
  referenceValue?: number;
};

/** Classify seller-stated price terms, never replace an unknown price with a market estimate. */
export function disclosedPriceEvidence(
  text: string,
  listedAmount?: unknown,
): PriceEvidence | undefined {
  const amount = positivePrice(listedAmount);
  const cashLabels =
    /\b(?:cash|full(?:\s+cash)?|total\s+purchase|sale)\s+price\s*(?:is|of|:|-)?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi;
  let rejectedCashLabel: string | undefined;
  const disclosedCash: PriceEvidence[] = [];
  for (const cash of Array.from(text.matchAll(cashLabels))) {
    const before = text.slice(Math.max(0, cash.index - 60), cash.index);
    const after = text.slice(
      cash.index + cash[0].length,
      cash.index + cash[0].length + 35,
    );
    if (
      /\b(?:(?:not|isn't|is not)(?:\s+the)?|estimated|estimate of|(?:savings|discount|rebate|reduction)\s+(?:off|on|from)(?:\s+the)?|monthly)\s*$/i.test(
        before,
      ) ||
      /^\s*(?:down\b|\/\s*mo(?:nth)?\b|per\s+month\b|a\s+month\b|monthly\b)/i.test(
        after,
      ) ||
      !positivePrice(cash[1].replace(/,/g, ""))
    ) {
      rejectedCashLabel = cash[0].slice(0, 180);
      continue;
    }
    disclosedCash.push({
      kind: "asking",
      askingPrice: positivePrice(cash[1].replace(/,/g, "")),
      listedAmount: amount,
      evidenceText: cash[0].slice(0, 180),
    });
  }
  if (new Set(disclosedCash.map((entry) => entry.askingPrice)).size > 1)
    return {
      kind: "unknown",
      listedAmount: amount,
      evidenceText: "Source listing discloses conflicting purchase prices.",
    };
  if (disclosedCash.length) return disclosedCash[0];
  const disclaimer =
    /(?:(?:price|amount)\s+(?:listed|shown|advertised)|(?:listed|shown|advertised)\s+(?:price|amount))\s+(?:may\s+be|is|represents)\s+(?:a\s+|the\s+)?down[\s-]*payment(?:\s+and\s+not\s+(?:the\s+)?full\s+price)?|not\s+(?:the\s+)?full\s+(?:cash\s+)?(?:purchase\s+)?price/i.exec(
      text,
    );
  if (disclaimer)
    return {
      kind: "down_payment",
      listedAmount: amount,
      evidenceText: disclaimer[0].slice(0, 180),
    };
  const labels =
    /\b(down[\s-]*payment|monthly\s+(?:payment|(?:sale\s+)?price)|deposit)\s*(?:is|of|:|-)?\s*\$?\s*([\d,]+(?:\.\d{2})?)/gi;
  let labelled: RegExpExecArray | null;
  while ((labelled = labels.exec(text))) {
    if (amount && positivePrice(labelled[2].replace(/,/g, "")) !== amount)
      continue;
    return {
      kind: /monthly/i.test(labelled[1]) ? "monthly_payment" : "down_payment",
      listedAmount: amount || positivePrice(labelled[2].replace(/,/g, "")),
      evidenceText: labelled[0].slice(0, 180),
    };
  }
  const moneyTerms =
    /(?:\$\s*|\b)([\d,]+(?:\.\d{2})?)\s*(down\b|(?:per\s*)?month\b|a\s+month\b|\/\s*mo(?:nth)?\b)/gi;
  let match: RegExpExecArray | null;
  while ((match = moneyTerms.exec(text))) {
    const number = positivePrice(match[1].replace(/,/g, ""));
    if (amount && number !== amount) continue;
    return {
      kind: /down/i.test(match[2]) ? "down_payment" : "monthly_payment",
      listedAmount: amount ?? number,
      evidenceText: match[0].slice(0, 180),
    };
  }
  const referenceLabels =
    /\b(?:savings|you\s+save|discount|rebate|msrp|retail\s+(?:price|value)|original\s+price)(?:\s+(?:off|on|from)(?:\s+the)?(?:\s+(?:cash|sale|full)\s+price)?)?\s*:?\s*\$\s*([\d,]+(?:\.\d{2})?)/gi;
  for (const reference of Array.from(text.matchAll(referenceLabels))) {
    const value = positivePrice(reference[1].replace(/,/g, ""));
    if (value && (!amount || value === amount))
      return {
        kind: "reference",
        listedAmount: amount || value,
        evidenceText: reference[0].slice(0, 180),
      };
  }
  if (/\blease\s+(?:takeover|take\s+over|transfer|assumption)\b/i.test(text))
    return {
      kind: "finance_teaser",
      listedAmount: amount,
      evidenceText: "Lease transfer; total purchase price not established.",
    };
  if (rejectedCashLabel)
    return {
      kind: "unknown",
      listedAmount: amount,
      evidenceText: rejectedCashLabel,
    };
  return undefined;
}

export function listingPriceEvidence(row: PriceRow): PriceEvidence | undefined {
  const amount = row.ask_price ?? row.askPrice;
  const stored = row.options?.priceEvidence;
  // Reinterpreting saved text is not a new source check. Retain even an invalid
  // supplied timestamp so comparison gates can reject it instead of refreshing it.
  const checkedAt =
    stored?.checkedAt == null
      ? undefined
      : typeof stored.checkedAt === "string"
        ? stored.checkedAt
        : "";
  const disclosed = disclosedPriceEvidence(
    `${row.title || ""} ${row.options?.listingTitle || ""} ${row.description || ""} ${row.options?.description || ""}`,
    amount,
  );
  if (disclosed) return { ...disclosed, checkedAt };
  if (
    stored &&
    [
      "asking",
      "down_payment",
      "monthly_payment",
      "finance_teaser",
      "current_bid",
      "buy_now",
      "reference",
      "unknown",
    ].includes(stored.kind)
  ) {
    if (stored.kind === "asking" && typeof stored.evidenceText === "string") {
      const inspected = disclosedPriceEvidence(
        stored.evidenceText,
        positivePrice(stored.askingPrice) || amount,
      );
      if (inspected && inspected.kind !== "asking")
        return { ...inspected, checkedAt };
    }
    return {
      kind: stored.kind,
      askingPrice: positivePrice(stored.askingPrice),
      listedAmount: positivePrice(stored.listedAmount),
      currentBid: positivePrice(stored.currentBid),
      buyNow: positivePrice(stored.buyNow),
      referenceValue: positivePrice(stored.referenceValue),
      evidenceText:
        typeof stored.evidenceText === "string"
          ? stored.evidenceText.slice(0, 180)
          : undefined,
      checkedAt,
    };
  }
  // Old dealer rows have not had their pricing disclaimer inspected. Fail closed on cash math.
  if (
    row.source === "craigslist_dealer" ||
    (row.source === "craigslist" &&
      String(row.seller_type || row.sellerType || row.options?.sellerType || "")
        .trim()
        .toLowerCase() === "dealer")
  )
    return {
      kind: "unknown",
      listedAmount: positivePrice(amount),
      evidenceText:
        "Full cash price has not been checked on the source listing.",
    };
  return undefined;
}

export function nonCashPriceLabel(evidence?: PriceEvidence) {
  if (evidence?.kind === "down_payment") return "Possible down payment";
  if (evidence?.kind === "monthly_payment") return "Monthly payment";
  if (evidence?.kind === "finance_teaser") return "Payment amount";
  if (evidence?.kind === "unknown" && evidence.listedAmount)
    return "Unverified advertised amount";
  return undefined;
}

export function priceEvidenceLabel(evidence?: PriceEvidence) {
  if (evidence?.kind === "current_bid") return "Current bid";
  if (evidence?.kind === "buy_now") return "Buy-now price";
  return nonCashPriceLabel(evidence);
}

export function positivePrice(value: unknown): number | undefined {
  const n =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

/** A pre-loss value is not an acquisition price; retain it only as reference evidence. */
export function reportedAcquisitionPrice(row: PriceRow): number {
  const evidence = listingPriceEvidence(row);
  if (
    evidence?.kind === "reference" ||
    evidence?.kind === "unknown" ||
    evidence?.kind === "down_payment" ||
    evidence?.kind === "monthly_payment" ||
    evidence?.kind === "finance_teaser" ||
    row.metadata?.price_is_acv_estimate === true ||
    row.metadata?.price_is_acv_estimate === "true" ||
    row.options?.price_is_acv_estimate === true ||
    row.options?.price_is_acv_estimate === "true"
  )
    return 0;
  if (evidence?.kind === "current_bid")
    return positivePrice(evidence.currentBid) || 0;
  if (evidence?.kind === "buy_now") return positivePrice(evidence.buyNow) || 0;
  if (evidence?.kind === "asking")
    return positivePrice(evidence.askingPrice) || 0;
  return positivePrice(row.ask_price ?? row.askPrice) || 0;
}
