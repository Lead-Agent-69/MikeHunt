"use client";

import useSWR from "swr";
import {
  inventoryCapacity,
  capacitySummary,
  type InventoryCapacity,
} from "@/lib/admin/inventory-capacity";

const megabytes = (value: number) => `${(value / 1_000_000).toFixed(1)} MB`;
async function load(url: string): Promise<InventoryCapacity> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Capacity information is unavailable.");
  const report = inventoryCapacity(await response.json());
  if (!report) throw new Error("Capacity information is unavailable.");
  return report;
}

export function InventoryCapacityPanel() {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    "/api/admin/capacity",
    load,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 60_000,
    },
  );
  const summary = data ? capacitySummary(data) : null;
  return (
    <section
      aria-labelledby="inventory-capacity-heading"
      className="min-w-0 rounded-lg border border-[var(--b1)] bg-[var(--s1)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2
            id="inventory-capacity-heading"
            className="font-semibold text-[var(--t1)]"
          >
            Inventory capacity
          </h2>
          <p className="mt-1 text-xs text-[var(--t4)]">
            Read-only storage assessment. Archival and deletion are disabled.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void mutate().catch(() => {});
          }}
          disabled={isValidating}
          className="min-h-11 rounded-md border border-[var(--b2)] px-4 text-sm font-semibold text-[var(--t2)] disabled:opacity-50"
        >
          {isValidating
            ? "Checking capacity…"
            : error
              ? "Retry capacity check"
              : "Check capacity"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-[var(--amber)]">
          Capacity information is temporarily unavailable.{" "}
          {data
            ? "The figures below are from the last successful check."
            : "No spare capacity or archive eligibility has been confirmed."}
        </p>
      )}
      {isLoading && (
        <p role="status" className="mt-3 text-sm text-[var(--t4)]">
          Measuring stored inventory…
        </p>
      )}
      {data && summary && (
        <>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[var(--t4)]">Database allocation</dt>
              <dd className="mt-1 font-bold text-[var(--t1)]">
                {megabytes(data.databaseBytes)}
              </dd>
              <dd className="text-xs text-[var(--t4)]">
                {summary.state === "normal"
                  ? "Below warning threshold"
                  : summary.state === "warning"
                    ? "Storage warning"
                    : "New intake stopped"}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--t4)]">Stored listings</dt>
              <dd className="mt-1 font-bold text-[var(--t1)]">
                {data.inventory.total.toLocaleString()}
              </dd>
              <dd className="text-xs text-[var(--t4)]">
                {data.inventory.active.toLocaleString()} marked active;
                freshness still applies
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[var(--t4)]">
                Unseen for over 30 days
              </dt>
              <dd className="mt-1 font-bold text-[var(--t1)]">
                {data.inventory.unseen30Days.toLocaleString()}
              </dd>
              <dd className="text-xs text-[var(--t4)]">
                Age only; not approved for archival
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-[var(--t2)]">
            {summary.archiveMessage}
          </p>
          <p className="mt-2 text-xs text-[var(--t4)]">
            Saved vehicles, watchlists, notes, purchases and outcomes stay
            protected. Recovery-key custody, verified restore and reference
            checks are required before archival can be enabled.
          </p>
          <details className="mt-4">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-[var(--t2)]">
              Storage breakdown
            </summary>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-xs">
                <caption className="py-2 text-left text-[var(--t4)]">
                  Largest 20 tables. Row and dead-row counts are estimates.
                  Allocated bytes are not immediately reclaimable space.
                </caption>
                <thead>
                  <tr>
                    {[
                      "Table",
                      "Total",
                      "Data / TOAST",
                      "Indexes",
                      "Est. rows",
                    ].map((label) => (
                      <th
                        key={label}
                        className="px-2 py-2 font-medium text-[var(--t4)]"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.relations.map((row) => (
                    <tr
                      key={`${row.schema_name}.${row.table_name}`}
                      className="border-t border-[var(--b1)] text-[var(--t2)]"
                    >
                      <td className="px-2 py-2">
                        {row.schema_name}.{row.table_name}
                      </td>
                      <td className="px-2 py-2">
                        {megabytes(row.total_bytes)}
                      </td>
                      <td className="px-2 py-2">
                        {megabytes(row.table_bytes)}
                      </td>
                      <td className="px-2 py-2">
                        {megabytes(row.index_bytes)}
                      </td>
                      <td className="px-2 py-2">
                        {row.estimated_live_rows.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <p className="mt-3 text-xs text-[var(--t4)]">
            Last successful check: {new Date(data.checkedAt).toLocaleString()}.
            Warning at 350 MB; insertion stop at 450 MB. Daily write allowances
            are separate.
          </p>
        </>
      )}
    </section>
  );
}
