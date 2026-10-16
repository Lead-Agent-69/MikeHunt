import {
  valuationExplanation,
  type ValuationInputs as Inputs,
} from "@/lib/valuation/explanation";

export function ValuationInputs({ valuation }: { valuation?: Inputs }) {
  return (
    <div className="mt-3 min-w-0 border-t border-[var(--b1)] pt-3">
      <dl className="space-y-2 text-xs">
        {valuationExplanation(valuation).map(([label, value]) => (
          <div
            key={label}
            className="grid min-w-0 grid-cols-1 gap-0.5 min-[400px]:grid-cols-2 min-[400px]:gap-3"
          >
            <dt className="text-[var(--t3)]">{label}</dt>
            <dd className="min-w-0 break-words font-semibold text-[var(--t1)]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-[var(--t3)]">
        These are recorded model inputs, not an inspection or guaranteed sale
        price. Individual comparable IDs, dates, and per-platform counts are not
        retained in this breakdown.
      </p>
    </div>
  );
}
