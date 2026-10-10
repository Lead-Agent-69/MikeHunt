import { buyTerm } from "@/lib/deal-terms";

type ListingFacts = {
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number | null;
  source?: string;
  mileage?: number | null;
  locationCity?: string;
  locationState?: string;
  titleType?: string;
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

export function VehicleSummary({ deal }: { deal: ListingFacts }) {
  const title =
    [deal.year, deal.make, deal.model].filter(Boolean).join(" ") ||
    "Vehicle listing";
  const facts = [
    [
      "Location",
      [deal.locationCity, deal.locationState].filter(Boolean).join(", ") ||
        "Not reported",
    ],
    [
      "Mileage",
      typeof deal.mileage === "number" &&
      Number.isFinite(deal.mileage) &&
      deal.mileage >= 0
        ? `${deal.mileage.toLocaleString()} mi`
        : "Not reported",
    ],
    [
      "Title / condition",
      (deal.titleType || deal.condition)?.replace(/_/g, " ") || "Not reported",
    ],
    ["Damage", deal.damageType?.replace(/_/g, " ") || "Not reported"],
    ["Run and drive", reportedStatus(deal.runAndDrive)],
    ["Keys", reportedStatus(deal.hasKeys)],
    ["VIN", deal.vin || "Not reported"],
    ["Last seen", reportedDate(deal.lastSeenAt)],
    ...(deal.auctionEndAt
      ? [["Auction ends", reportedDate(deal.auctionEndAt)]]
      : []),
  ];
  return (
    <section aria-label="Vehicle summary" className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="min-w-0 max-w-full break-words text-xl font-bold text-[var(--t1)]">
          {title}
        </h1>
        <div className="shrink-0">
          <p className="text-xs text-[var(--t3)]">
            {buyTerm(deal.source).priceLabel}
          </p>
          <p className="text-xl font-bold text-[var(--t1)]">
            {reportedMoney(deal.askPrice)}
          </p>
        </div>
      </div>
      {deal.decisionEvidence?.acquisitionReady === false && (
        <p className="text-sm font-semibold text-[var(--amber-d)]">
          {deal.decisionEvidence.label || "Evidence incomplete"}: research
          before purchase.
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-5 gap-y-2 text-xs sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[var(--t4)]">{label}</dt>
            <dd className="mt-0.5 break-words font-semibold text-[var(--t2)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
