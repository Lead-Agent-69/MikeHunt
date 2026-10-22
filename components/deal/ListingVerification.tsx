import { fieldLabel, type DataQualityField } from "@/lib/data-quality";
import type { DecisionEvidence } from "@/lib/intelligence/decision-guard";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { VehicleSourceAction } from "./VehicleSourceAction";

export type VerificationSection = "condition" | "market" | "plan";

type Props = {
  present: DataQualityField[];
  missing: DataQualityField[];
  evidence?: DecisionEvidence;
  priceKind?: PriceEvidence["kind"];
  sourceUrl?: string | null;
  dealerMode?: boolean;
  onOpenSection: (section: VerificationSection) => void;
};

export function ListingVerification({
  present,
  missing,
  evidence,
  priceKind,
  sourceUrl,
  dealerMode = false,
  onOpenSection,
}: Props) {
  const auction =
    evidence?.state === "auction_watch" || priceKind === "current_bid";
  const priceCheck = auction
    ? "Confirm the final bid or buy-now terms, buyer fees, and purchase eligibility. A current bid is not the final purchase price."
    : ["down_payment", "monthly_payment", "finance_teaser"].includes(
          priceKind || "",
        )
      ? "Ask for the full cash price and required fees. A payment or down payment cannot establish the purchase cost."
      : "Confirm availability, the full purchase price, and required fees with the seller.";
  const actions: {
    section: VerificationSection;
    title: string;
    detail: string;
    action: string;
  }[] = [
    {
      section: "condition",
      title: "Identity, title, and condition",
      detail:
        "Match the VIN and mileage, review title documents, and arrange an independent inspection. Listing claims do not confirm condition.",
      action: "Check title and condition",
    },
    {
      section: "market",
      title: "Comparable market evidence",
      detail:
        "Compare the same vehicle and condition. Dated sale records and current asking prices serve different purposes.",
      action: "Compare market evidence",
    },
    {
      section: "plan",
      title: "All-in costs and your notes",
      detail: dealerMode
        ? "Plan repair, transport, taxes, fees, holding, and selling costs. Scenario assumptions do not verify a purchase or establish actual profit."
        : "Check repair, transport, taxes, fees, and registration against your budget. Keep the seller's answers in your private notes.",
      action: dealerMode
        ? "Plan costs and contact"
        : "Contact seller and keep notes",
    },
  ];
  const fields: DataQualityField[] = [
    "photo",
    "vin",
    "title",
    "mileage",
    "damage",
    "location",
    "seller",
    "sellerContact",
    "price",
    "source",
    "auction",
  ];
  return (
    <section
      aria-label="Before you decide"
      className="min-w-0 border-y border-[var(--b1)] py-4"
    >
      <h2 className="text-base font-bold text-[var(--t1)]">
        Before you decide
      </h2>
      <p
        className={`mt-2 text-sm font-semibold ${evidence?.acquisitionReady ? "text-[var(--green)]" : "text-[var(--amber-d)]"}`}
      >
        {evidence?.label || "Evidence incomplete"}
      </p>
      <p className="mt-1 text-sm text-[var(--t3)]">
        {evidence?.summary ||
          "The listing alone does not establish condition or fair value."}
      </p>
      <p className="mt-3 rounded-lg bg-[var(--s1)] p-3 text-sm text-[var(--t2)]">
        <span className="font-semibold">Next check: </span>
        {evidence?.nextCheck ||
          "Confirm VIN, title, mileage, seller identity, availability, and any damage or repairs."}
      </p>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <li className="flex min-w-0 flex-col rounded-lg border border-[var(--b1)] p-3">
          <h3 className="text-sm font-semibold text-[var(--t1)]">
            Price and availability
          </h3>
          <p className="mt-1 mb-3 flex-1 text-sm text-[var(--t3)]">
            {priceCheck}
          </p>
          <VehicleSourceAction sourceUrl={sourceUrl} auction={auction} />
        </li>
        {actions.map(({ section, title, detail, action }) => (
          <li
            key={section}
            className="flex min-w-0 flex-col rounded-lg border border-[var(--b1)] p-3"
          >
            <h3 className="text-sm font-semibold text-[var(--t1)]">{title}</h3>
            <p className="mt-1 mb-3 flex-1 text-sm text-[var(--t3)]">
              {detail}
            </p>
            <button
              type="button"
              onClick={() => onOpenSection(section)}
              className="premium-focus min-h-11 rounded-lg border border-[var(--b2)] px-3 py-2 text-left text-sm font-semibold text-[var(--blue)]"
            >
              {action}
            </button>
          </li>
        ))}
      </ol>
      <details className="mt-3 group">
        <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-3 text-sm font-semibold text-[var(--t2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
          Listing evidence and missing details
        </summary>
        <p className="mt-2 text-xs text-[var(--t4)]">
          These details are source-provided and are not a mechanic inspection.
          Damage reported does not establish its severity or repair cost. A
          reported amount does not confirm the full purchase price.
        </p>
        {missing.length > 0 && (
          <p className="mt-2 text-sm text-[var(--t2)]">
            Missing or unusable: {missing.map(fieldLabel).join(", ")}.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {fields
            .filter(
              (field) => present.includes(field) || missing.includes(field),
            )
            .map((field) => (
              <div
                key={field}
                className="flex justify-between gap-4 border-b border-[var(--b1)] py-2 text-sm"
              >
                <dt className="text-[var(--t3)]">
                  {field === "damage"
                    ? "Condition reported"
                    : field === "price"
                      ? "Amount reported"
                      : fieldLabel(field)}
                </dt>
                <dd className="text-right text-[var(--t2)]">
                  {present.includes(field)
                    ? "Source provided"
                    : "Not available"}
                </dd>
              </div>
            ))}
        </dl>
      </details>
    </section>
  );
}
