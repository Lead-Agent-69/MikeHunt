import { load } from "cheerio";
import {
  disclosedPriceEvidence,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";
import { normalizeCondition } from "../normalize-condition";

/** Parse one amount, never concatenate a price range, payment term or decimal separator. */
export function retailMoney(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!/^(?:US\s*)?\$?\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(text))
    return undefined;
  const amount = Number(
    text.replace(/^(?:US\s*)?\$?\s*/, "").replace(/,/g, ""),
  );
  return Number.isFinite(amount) && amount > 0 && amount <= 100_000_000
    ? Math.round(amount)
    : undefined;
}

/** Missing/invalid mileage stays unknown; an explicitly reported zero remains zero. */
export function retailMileage(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") return undefined;
  const text = String(value).trim();
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:mi(?:les)?)?$/i.test(text))
    return undefined;
  const amount = Number(text.replace(/\s*mi(?:les)?$/i, "").replace(/,/g, ""));
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= 2_000_000
    ? amount
    : undefined;
}

/** Read only this vehicle card's visible terms. Parsing cached HTML is not a fresh check. */
function visibleRetailText(html: string): string {
  const $ = load(html);
  $("script,style,template,noscript").remove();
  const pieces: string[] = [];
  $.root()
    .find("*")
    .contents()
    .each((_, node) => {
      if (node.type === "text") pieces.push(node.data);
    });
  return pieces.join(" ").replace(/\s+/g, " ").trim();
}

/** Explicit title brands only; cosmetic wording, negated claims and conflicts remain unknown. */
export function retailTitleCondition(html: string): string | undefined {
  const text = visibleRetailText(html);
  const brands = new Set<string>();
  const pattern =
    /\b(?:(?:clean|clear|rebuilt|salvage)\s+title|title\s*[:=-]\s*(?:clean|clear|rebuilt|salvage)|parts\s+only|non[ -]repairable|certificate\s+of\s+destruction)\b/gi;
  for (const match of Array.from(text.matchAll(pattern))) {
    const before = text.slice(Math.max(0, match.index - 45), match.index);
    const after = text.slice(
      match.index + match[0].length,
      match.index + match[0].length + 30,
    );
    if (
      /\b(?:no|not|without|unknown|unverified)\b[^.!?]*$/i.test(before) ||
      /^\s*(?:\?|unknown\b|unverified\b|pending\b|not\b)/i.test(after)
    )
      continue;
    const condition = normalizeCondition(match[0]);
    if (condition) brands.add(condition);
  }
  return brands.size === 1 ? Array.from(brands)[0] : undefined;
}

export function retailCardPriceEvidence(
  html: string,
  amount: number,
  observedAt?: string,
): PriceEvidence {
  const text = visibleRetailText(html);
  const evidence = disclosedPriceEvidence(text, amount);
  if (
    evidence?.kind === "asking" &&
    !Number.isFinite(Date.parse(observedAt || ""))
  )
    return {
      kind: "unknown",
      listedAmount: amount,
      evidenceText: "Purchase price terms have no source observation date.",
      checkedAt: observedAt,
    };
  return {
    ...(evidence || {
      kind: "unknown" as const,
      listedAmount: amount,
      evidenceText: "The source card does not establish a full purchase price.",
    }),
    checkedAt: observedAt,
  };
}
