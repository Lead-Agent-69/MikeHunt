import { fieldLabel } from "@/lib/data-quality";

type Props = {
  present: string[];
  missing: string[];
  acquisitionReady: boolean;
  summary?: string;
  nextCheck?: string;
};

export function ListingVerification({
  present,
  missing,
  acquisitionReady,
  summary,
  nextCheck,
}: Props) {
  const fields = [
    "photo",
    "vin",
    "title",
    "mileage",
    "damage",
    "sellerContact",
    "price",
    "source",
  ];
  return (
    <section
      aria-label="Before you decide"
      className="border-y border-[var(--b1)] py-4"
    >
      <h2 className="text-base font-bold text-[var(--t1)]">
        Before you decide
      </h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--t1)]">
            Why this verdict?
          </h3>
          <p className="mt-1 text-sm text-[var(--t3)]">
            {summary ||
              "The listing alone does not establish condition or fair value. Verify it before making an offer."}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--t1)]">
            What would make this a buy?
          </h3>
          <p className="mt-1 text-sm text-[var(--t3)]">
            {acquisitionReady
              ? "Confirm the inspection, title, comparable prices, and all-in costs meet your goal."
              : "A verified inspection, condition-matched comparisons, and a complete cost estimate within your budget."}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-[var(--t1)]">
            What still needs checking?
          </h3>
          <p className="mt-1 text-sm text-[var(--t3)]">
            {nextCheck ||
              "Confirm VIN, title, mileage, seller identity, availability, and any damage or repairs."}
          </p>
        </div>
      </div>
      <details className="mt-3 group">
        <summary className="min-h-11 cursor-pointer rounded-lg px-2 py-3 text-sm font-semibold text-[var(--t2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--blue)]">
          Listing evidence and missing details
        </summary>
        <p className="mt-2 text-xs text-[var(--t4)]">
          Source-provided details are not inspection findings. Damage reported
          does not establish its severity or repair cost.
        </p>
        {missing.length > 0 && (
          <p className="mt-2 text-sm text-[var(--t2)]">
            Not provided:{" "}
            {missing
              .map((field) =>
                fieldLabel(field as Parameters<typeof fieldLabel>[0]),
              )
              .join(", ")}
            .
          </p>
        )}
        <dl className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field}
              className="flex justify-between gap-4 border-b border-[var(--b1)] py-2 text-sm"
            >
              <dt className="text-[var(--t3)]">
                {field === "damage"
                  ? "Damage reported"
                  : fieldLabel(field as Parameters<typeof fieldLabel>[0])}
              </dt>
              <dd className="text-right text-[var(--t2)]">
                {present.includes(field) ? "Source provided" : "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}
