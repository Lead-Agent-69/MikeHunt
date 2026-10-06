"use client";

import Link from "next/link";
import useSWR from "swr";
import { ErrorState } from "@/components/shared/ErrorState";
import { sourceMeta } from "@/lib/sources/source-meta";

type Candidate = {
  id: string;
  year?: number;
  make?: string;
  model?: string;
  askPrice?: number;
  mileage?: number;
  condition?: string;
  lastSeenAt?: string;
  source?: string;
  sourceUrl?: string;
  images?: string[];
  dealAnalysis?: { costs?: { repair?: number; transport?: number } };
};

const money = (value?: number) =>
  value == null
    ? "Not confirmed"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(value);

export function VehicleComparison({ ids }: { ids: string[] }) {
  const key = ids.slice(0, 4).join(",");
  const { data, error, isLoading, mutate } = useSWR<Candidate[]>(
    key ? ["candidate-comparison", key] : null,
    async () =>
      Promise.all(
        key.split(",").map(async (id) => {
          const response = await fetch(`/api/deals/${encodeURIComponent(id)}`);
          if (!response.ok)
            throw new Error("A selected vehicle could not be loaded.");
          const body = await response.json();
          if (!body.deal) throw new Error("A selected vehicle is unavailable.");
          return body.deal;
        }),
      ),
    { revalidateOnFocus: false },
  );

  if (isLoading) return <p role="status">Loading selected vehicles...</p>;
  if (error)
    return (
      <ErrorState
        title="Couldn't compare these vehicles"
        message="One of the selected vehicles could not be loaded. Your saves are unchanged."
        onRetry={() => void mutate()}
      />
    );
  if (!data?.length)
    return (
      <p className="text-[var(--t3)]">
        Select two to four vehicles in{" "}
        <Link className="text-[var(--blue)] underline" href="/saved">
          Saved
        </Link>{" "}
        to compare them.
      </p>
    );

  const rows: { label: string; value: (candidate: Candidate) => string }[] = [
    { label: "Listed price / bid", value: (c) => money(c.askPrice) },
    {
      label: "Mileage reported",
      value: (c) =>
        c.mileage == null ? "Not reported" : `${c.mileage.toLocaleString()} mi`,
    },
    {
      label: "Condition reported",
      value: (c) =>
        c.condition ? c.condition.replace(/_/g, " ") : "Not confirmed",
    },
    {
      label: "Repair allowance (estimate)",
      value: (c) => money(c.dealAnalysis?.costs?.repair),
    },
    {
      label: "Transport (estimate)",
      value: (c) => money(c.dealAnalysis?.costs?.transport),
    },
    {
      label: "Known-cost subtotal",
      value: (c) =>
        c.askPrice == null
          ? "Not confirmed"
          : money(
              c.askPrice +
                (c.dealAnalysis?.costs?.repair || 0) +
                (c.dealAnalysis?.costs?.transport || 0),
            ),
    },
    {
      label: "All-in cost",
      value: () =>
        "Incomplete: verify fees, tax, registration and repair quote",
    },
    {
      label: "Last seen at source",
      value: (c) =>
        c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : "Unknown",
    },
    { label: "Listing source", value: (c) => sourceMeta(c.source || "").label },
    {
      label: "Next check",
      value: () => "Verify availability, title, inspection and final costs",
    },
  ];

  return (
    <div className="overflow-x-auto border border-[var(--b1)] rounded-lg">
      <table className="w-full text-sm">
        <caption className="p-3 text-left text-[var(--t3)]">
          Listing claims and estimated costs. A lower subtotal alone does not
          establish a better vehicle.
        </caption>
        <thead>
          <tr>
            <th className="min-w-36 p-3 text-left">Compare</th>
            {data.map((c) => (
              <th key={c.id} className="min-w-44 p-3 text-left">
                <Link href={`/deal/${c.id}`} className="text-[var(--blue)]">
                  {c.year} {c.make} {c.model}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label} className="border-t border-[var(--b1)]">
              <th
                scope="row"
                className="p-3 text-left font-medium text-[var(--t3)]"
              >
                {row.label}
              </th>
              {data.map((c) => (
                <td key={c.id} className="p-3 align-top">
                  {row.value(c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
