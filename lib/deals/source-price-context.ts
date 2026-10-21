import {
  listingPriceEvidence,
  positivePrice,
  type PriceEvidence,
} from "./acquisition-price";
import { isAuctionChannel } from "@/lib/sources/source-meta";
import { retailAskingRows } from "./retail-asking";
import { dealFreshness } from "./freshness";
import {
  hasOpenPriceWindow,
  isRecentPriceObservation,
} from "./price-observation";
import { vendorIdentity } from "@/lib/sources/vendor-identity";

export const SOURCE_PRICE_FIELDS =
  "source,ask_price,buy_now_price,title,last_seen_at,condition,damage_type,mileage,auction_end_at,source_url,price_evidence:options->priceEvidence,seller_type:options->>sellerType,listing_title:options->>listingTitle,listing_description:options->>description,reference_only:options->>price_is_acv_estimate";

export type SourcePriceRow = {
  source?: string | null;
  source_url?: string | null;
  ask_price?: unknown;
  buy_now_price?: unknown;
  title?: string | null;
  listing_title?: string | null;
  listing_description?: string | null;
  seller_type?: string | null;
  price_evidence?: Record<string, unknown> | null;
  reference_only?: string | null;
  last_seen_at?: string | null;
  condition?: string | null;
  damage_type?: string | null;
  mileage?: number | null;
  auction_end_at?: string | null;
};
const LABELS: Record<PriceEvidence["kind"], string> = {
  asking: "Asking price",
  buy_now: "Buy-now price",
  current_bid: "Current bid",
  down_payment: "Possible down payment",
  monthly_payment: "Monthly payment",
  finance_teaser: "Payment amount",
  reference: "Reference value",
  unknown: "Unverified advertised amount",
};

/** Display every reported amount, but never promote a bid/payment/estimate into cash math. */
export function sourcePriceContext(row: SourcePriceRow, now = Date.now()) {
  const advertisedAmount = positivePrice(row.ask_price) ?? null;
  const evidence = listingPriceEvidence({
    source: row.source || undefined,
    ask_price: row.ask_price,
    title: `${row.title || ""} ${row.listing_title || ""}`,
    description: row.listing_description,
    seller_type: row.seller_type,
    options: { priceEvidence: row.price_evidence, sellerType: row.seller_type },
  });
  const buyNowPrice =
    positivePrice(evidence?.buyNow) ?? positivePrice(row.buy_now_price) ?? null;
  let kind: PriceEvidence["kind"] =
    row.reference_only === "true"
      ? "reference"
      : (evidence?.kind ??
        (buyNowPrice
          ? "buy_now"
          : isAuctionChannel(row.source)
            ? "current_bid"
            : "unknown"));
  const askingPrice =
    kind === "asking" ? (positivePrice(evidence?.askingPrice) ?? null) : null;
  if (kind === "asking" && askingPrice == null) kind = "unknown";
  const cashPrice =
    kind === "asking"
      ? askingPrice
      : kind === "buy_now" || kind === "current_bid"
        ? buyNowPrice
        : null;
  const amount =
    kind === "asking"
      ? askingPrice
      : kind === "buy_now"
        ? buyNowPrice
        : kind === "current_bid"
          ? (positivePrice(evidence?.currentBid) ?? advertisedAmount)
          : kind === "reference"
            ? (positivePrice(evidence?.referenceValue) ?? advertisedAmount)
            : advertisedAmount;
  const fresh = isRecentPriceObservation(row.last_seen_at, now);
  const evidenceCurrent =
    evidence?.checkedAt == null ||
    isRecentPriceObservation(evidence.checkedAt, now);
  const open = hasOpenPriceWindow(row.auction_end_at, now);
  const url = vendorIdentity(row.source, row.source_url).href;
  const comparisonEligible =
    cashPrice != null && fresh && evidenceCurrent && open && !!url;
  const canCompareToAskingCurve =
    comparisonEligible &&
    kind === "asking" &&
    retailAskingRows([
      {
        source: row.source,
        ask_price: cashPrice,
        source_url: row.source_url,
        condition: row.condition,
        damage_type: row.damage_type,
        title: `${row.title || ""} ${row.listing_title || ""}`,
        mileage: row.mileage,
        auction_end_at: row.auction_end_at,
      },
    ]).length === 1;
  return {
    kind,
    label: LABELS[kind],
    amount,
    advertisedAmount,
    cashPrice,
    buyNowPrice,
    comparisonEligible,
    evidenceCurrent,
    observationCurrent: fresh && open && !!url && dealFreshness(row, now).live,
    canCompareToAskingCurve,
  };
}
