import { fieldLabel, type DataQualityField } from "@/lib/data-quality";
import type { DecisionEvidence } from "@/lib/intelligence/decision-guard";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { VehicleSourceAction } from "./VehicleSourceAction";
import { isAuctionSource } from "@/lib/deal-terms";

export type VerificationSection = "condition" | "market" | "plan";

type Props = {
  present: DataQualityField[];
  missing: DataQualityField[];
  evidence?: DecisionEvidence;
  priceKind?: PriceEvidence["kind"];
  sourceUrl?: string | null;
  source?: string | null;
  observationLabel?: string;
  availabilityWarning?: string | null;
  dealerMode?: boolean;
  onOpenSection: (section: VerificationSection) => void;
};

export function ListingVerification({
  present,
  missing,
  evidence,
  priceKind,
  sourceUrl,
  source,
  observationLabel,
  availabilityWarning,
  dealerMode = false,
  onOpenSection,
}: Props) {
  const auction =
    evidence?.state === "auction_watch" ||
    priceKind === "current_bid" ||
    isAuctionSource(source);
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
    <section aria-label="Before you decide" className="min-w-0">
      <h2 className="text-base font-bold text-[var(--t1)]">
        Before you decide
      </h2>
      {availabilityWarning && (
        <p
          role="status"
          className="mt-3 rounded-lg border border-[var(--amber-d)] bg-[var(--s1)] p-3 text-sm font-semibold text-[var(--t1)]"
        >
          {availabilityWarning}
        </p>
      )}
      <p className="mt-2 text-xs text-[var(--t4)]">
        {observationLabel || "Freshness unknown"}
      </p>
      <p
        className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${evidence?.acquisitionReady ? "bg-[var(--s2)] text-[var(--green)]" : "bg-[var(--s2)] text-[var(--amber-d)]"}`}
      >
        {evidence?.label || "Evidence incomplete"}
      </p>
      <div className="mt-3 rounded-xl border border-[var(--b1)] bg-[var(--s0)] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--t4)]">
          Next check:
        </p>
        <p className="mt-1 text-sm font-semibold leading-relaxed text-[var(--t1)]">
          {evidence?.nextCheck ||
            "Confirm VIN, title, mileage, seller identity, availability, and any damage or repairs."}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onOpenSection("plan")}
        className="premium-focus mt-3 flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border border-[var(--b1)] px-3 py-2 text-left"
      >
        <span className="text-sm font-semibold text-[var(--t1)]">
          All-in cost
        </span>
        <span className="text-xs font-semibold text-[var(--blue)]">
          {evidence?.acquisitionReady
            ? "Review recorded costs →"
            : "Needs confirmation →"}
        </span>
      </button>
      <div className="mt-3 divide-y divide-[var(--b1)] rounded-xl border border-[var(--b1)]">
        <details className="group px-3">
          <summary className="premium-focus min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t1)]">
            Why this verdict?
          </summary>
          <p className="pb-3 text-sm leading-relaxed text-[var(--t3)]">
            {evidence?.summary ||
              "The listing alone does not establish condition or fair value."}
          </p>
        </details>
        <details className="group px-3">
          <summary className="premium-focus min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t1)]">
            What would make this a buy?
          </summary>
          <div className="space-y-2 pb-3 text-sm leading-relaxed text-[var(--t3)]">
            <p>{priceCheck}</p>
            <p>
              {evidence?.acquisitionReady
                ? "Review the final terms against your budget and confirm that the recorded evidence is still current."
                : "Confirm title and condition, obtain a complete cost plan, and compare relevant market evidence. A low advertised amount alone is not enough."}
            </p>
            <VehicleSourceAction sourceUrl={sourceUrl} auction={auction} />
          </div>
        </details>
        <details className="group px-3">
          <summary className="premium-focus min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t1)]">
            What still needs checking?
          </summary>
          <p className="pb-2 text-sm text-[var(--t3)]">
            {missing.length
              ? `Missing or unusable: ${missing.map(fieldLabel).join(", ")}.`
              : "Recorded fields do not replace an inspection or confirmation of the final terms."}
          </p>
          <ol className="space-y-3 pb-3">
            {actions.map(({ section, title, detail, action }) => (
              <li key={section}>
                <h3 className="text-sm font-semibold text-[var(--t1)]">
                  {title}
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-[var(--t3)]">
                  {detail}
                </p>
                <button
                  type="button"
                  onClick={() => onOpenSection(section)}
                  className="premium-focus mt-2 min-h-11 w-full rounded-lg border border-[var(--b2)] px-3 py-2 text-left text-sm font-semibold text-[var(--blue)]"
                >
                  {action}
                </button>
              </li>
            ))}
          </ol>
        </details>
      </div>
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
