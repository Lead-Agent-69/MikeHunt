"use client";
import React from "react";
import { useDealerId } from "@/hooks/useDealerId";
import useSWR, { mutate } from "swr";
import { OutcomeEditor } from "@/components/outcomes/OutcomeEditor";
import { ledgerTotals, type LedgerRow } from "@/lib/outcomes/ledger";

interface Props {
  dealId: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
}
async function fetcher(url: string) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Your outcome records could not be loaded.");
  return response.json();
}
export function LogOutcome(props: Props) {
  const { dealerId, loading: accountLoading } = useDealerId();
  const url = `/api/outcomes?dealId=${encodeURIComponent(props.dealId)}`;
  const {
    data,
    error,
    isLoading,
    mutate: reload,
  } = useSWR(
    dealerId && !accountLoading ? [url, dealerId] : null,
    ([path]: [string, string]) => fetcher(path),
    { revalidateOnFocus: false },
  );
  const [open, setOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  React.useEffect(() => {
    setOpen(false);
    setMessage("");
  }, [dealerId]);
  const record: LedgerRow | undefined = data?.outcomes?.[0];
  return (
    <section
      aria-label="Actual flip outcome"
      className="min-w-0 rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4 sm:p-5"
    >
      <h3 className="text-lg font-bold">Track the actual result</h3>
      <p className="mt-1 text-sm text-[var(--t3)]">
        Record what you paid, then update the same purchase when it sells.
        Complete cost records can support personal learning when enough matched
        predictions exist.
      </p>
      {error ? (
        <div role="alert" className="mt-3 text-sm">
          <p>{error.message}</p>
          <button
            type="button"
            className="min-h-11 text-[var(--blue)] underline"
            onClick={() => reload()}
          >
            Retry outcome records
          </button>
        </div>
      ) : isLoading || accountLoading ? (
        <p role="status" className="mt-3 text-sm">
          Loading your records...
        </p>
      ) : !dealerId ? (
        <a
          href="/login"
          className="inline-flex min-h-11 items-center text-[var(--blue)]"
        >
          Sign in to record an outcome
        </a>
      ) : open ? (
        <div className="mt-4">
          <OutcomeEditor
            key={`${dealerId}:${record?.id ?? "new"}:${record?.revision ?? 0}`}
            {...props}
            ownerId={dealerId!}
            record={record}
            onCancel={() => setOpen(false)}
            onReload={() => reload()}
            onSaved={async (saved) => {
              setOpen(false);
              setMessage(
                ledgerTotals(saved).complete
                  ? "Sale saved with confirmed actual costs."
                  : "Record saved. Complete the sale and cost review when ready.",
              );
              await reload();
              mutate(["/api/outcomes", dealerId]);
              mutate(["/api/calibration", dealerId]);
              mutate(["/api/insights/source-roi", dealerId]);
              mutate(`/api/deal-iq/${props.dealId}`);
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)]"
        >
          {record ? "Update actual outcome" : "Record actual purchase or sale"}
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-[var(--t3)]">
          {message}
        </p>
      )}
      {data?.outcomes?.length > 1 && (
        <p className="mt-3 text-xs text-[var(--t3)]">
          Showing your most recently updated record for this listing. Review all
          purchase records in Intelligence.
        </p>
      )}
    </section>
  );
}
