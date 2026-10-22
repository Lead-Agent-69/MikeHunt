import {
  nonCashPriceLabel,
  priceEvidenceLabel,
  type PriceEvidence,
} from "@/lib/deals/acquisition-price";
import { needsOperabilityFacts } from "@/lib/deals/condition-display";
import { sourcePriceContext } from "@/lib/deals/source-price-context";
import { vehicleLocation } from "@/lib/search/vehicle-location";
import { listingIdentityWarning } from "@/lib/vehicle/listing-identity";
import {
  conditionFromTitleType,
  titleBadgeModel,
} from "@/lib/deals/title-badge-model";

type ListingFacts = {
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  trim?: string;
  askPrice?: number | null;
  priceEvidence?: PriceEvidence;
  source?: string;
  mileage?: number | null;
  locationCity?: string;
  locationState?: string;
  titleType?: string;
  titleSource?: string | null;
  condition?: string;
  damageType?: string;
  vin?: string;
  runAndDrive?: boolean | null;
  hasKeys?: boolean | null;
  lastSeenAt?: string;
  auctionEndAt?: string;
  decisionEvidence?: { acquisitionReady?: boolean; label?: string };
};

const reportedMoney = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value)
    : "Not reported";
const reportedDate = (value?: string) => {
  if (!value || !Number.isFinite(new Date(value).getTime()))
    return "Not reported";
  return new Date(value).toLocaleString();
};
const reportedStatus = (value?: boolean | null) =>
  value === true
    ? "Reported yes"
    : value === false
      ? "Reported no"
      : "Not reported";

export function VehicleSummary({
  deal,
  showFacts = true,
}: {
  deal: ListingFacts;
  showFacts?: boolean;
}) {
  const reportedTitle =
    typeof deal.title === "string"
      ? deal.title.replace(/\s+/g, " ").trim()
      : "";
  const title =
    reportedTitle ||
    [deal.year, deal.make, deal.model, deal.trim].filter(Boolean).join(" ") ||
    "Vehicle listing";
  const price = sourcePriceContext({
    source: deal.source,
    title,
    ask_price: deal.askPrice,
    price_evidence: deal.priceEvidence,
  });
  const identityWarning = listingIdentityWarning(deal);
  return (
    <section aria-label="Vehicle summary" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 max-w-full break-words text-xl font-bold text-[var(--t1)]">
          {title}
        </h1>
        <div className="shrink-0">
          <p className="text-xs text-[var(--t3)]">
            {priceEvidenceLabel(deal.priceEvidence) || price.label}
          </p>
          <p className="text-xl font-bold text-[var(--t1)]">
            {reportedMoney(
              nonCashPriceLabel(deal.priceEvidence)
                ? deal.priceEvidence?.listedAmount
                : deal.askPrice,
            )}
          </p>
        </div>
      </div>
      {identityWarning && (
        <p
          role="status"
          className="text-sm font-semibold text-[var(--amber-d)]"
        >
          {identityWarning}
        </p>
      )}
      {nonCashPriceLabel(deal.priceEvidence) && (
        <p className="text-sm text-[var(--amber-d)]">
          Full cash price unconfirmed. {deal.priceEvidence?.evidenceText} Ask
          the seller for the total price and required fees; value and profit
          cannot be assessed from this amount.
        </p>
      )}
      {deal.decisionEvidence?.acquisitionReady === false && (
        <p className="text-sm font-semibold text-[var(--amber-d)]">
          {deal.decisionEvidence.label || "Evidence incomplete"}: research
          before purchase.
        </p>
      )}
      {showFacts && <VehicleFacts deal={deal} />}
    </section>
  );
}

export function VehicleFacts({
  deal,
  compact = false,
}: {
  deal: ListingFacts;
  compact?: boolean;
}) {
  const auctionFacts = needsOperabilityFacts(deal);
  const title = titleBadgeModel({
    ...deal,
    condition: deal.condition || conditionFromTitleType(deal.titleType),
  });
  const facts = [
    ["Location", vehicleLocation(deal.locationCity, deal.locationState)],
    [
      "Mileage",
      typeof deal.mileage === "number" &&
      Number.isFinite(deal.mileage) &&
      deal.mileage >= 0
        ? `${deal.mileage.toLocaleString()} mi`
        : "Not reported",
    ],
    ["Title / condition", title.label],
    ...(auctionFacts || deal.damageType
      ? [
          [
            deal.damageType?.trim().toLowerCase() === "repairable"
              ? "Source category"
              : "Damage",
            deal.damageType?.replace(/_/g, " ") || "Not reported",
          ],
        ]
      : []),
    ...(auctionFacts || typeof deal.runAndDrive === "boolean"
      ? [["Run and drive", reportedStatus(deal.runAndDrive)]]
      : []),
    ...(auctionFacts || typeof deal.hasKeys === "boolean"
      ? [["Keys", reportedStatus(deal.hasKeys)]]
      : []),
    ["VIN", deal.vin || "Not reported"],
    ["Last seen", reportedDate(deal.lastSeenAt)],
    ...(deal.auctionEndAt
      ? [["Auction ends", reportedDate(deal.auctionEndAt)]]
      : []),
  ];
  return (
    <dl
      aria-label="Vehicle facts"
      className={`grid grid-cols-2 gap-x-5 gap-y-3 text-xs ${compact ? "" : "sm:grid-cols-4"}`}
    >
      {facts.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-[var(--t4)]">{label}</dt>
          <dd className="mt-0.5 break-words font-semibold text-[var(--t2)]">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
