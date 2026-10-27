"use client";

import React, { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { Check, ExternalLink, Loader2, Plus, X } from "lucide-react";
import Link from "next/link";
import { useDealerId } from "@/hooks/useDealerId";
import { useRecordOwner } from "@/hooks/useRecordOwner";
import { actualAmount, uuid } from "@/lib/outcomes/ledger";
import { purchaseRetryId } from "@/lib/inventory/purchase-record";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import {
  writeInventory,
  invalidateInventoryViews,
  ownerInventoryFetcher,
} from "@/lib/inventory/account-client";

interface AcquireButtonProps {
  deal: {
    id?: string;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    askPrice?: number;
    condition?: string;
    trueNetProfit?: number;
    sellEstimate?: number;
    locationCity?: string;
    locationState?: string;
  };
  className?: string;
  label?: string;
  onRecorded?: () => void | boolean | Promise<void | boolean>;
}

export function AcquireToPipelineButton(props: AcquireButtonProps) {
  const { dealerId, loading } = useDealerId();
  if (!loading && !dealerId)
    return (
      <Link
        href="/login"
        className={`inline-flex min-h-11 items-center rounded-lg border border-[var(--b2)] px-3 text-sm ${props.className || ""}`}
      >
        Sign in to record purchase
      </Link>
    );
  return (
    <PurchaseRecord
      key={`${dealerId}:${props.deal.id || props.deal.vin || [props.deal.year, props.deal.make, props.deal.model].join(":")}`}
      {...props}
      ownerId={dealerId}
      accountLoading={loading}
    />
  );
}

function PurchaseRecord({
  deal,
  className = "",
  label = "Record purchase",
  onRecorded,
  ownerId,
  accountLoading,
}: AcquireButtonProps & { ownerId: string | null; accountLoading: boolean }) {
  const isCurrentOwner = useRecordOwner(ownerId);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acquired, setAcquired] = useState(false);
  const {
    data: existingPurchase,
    isLoading: checkingPurchase,
    error: purchaseCheckError,
    mutate: retryPurchaseCheck,
  } = useSWR(
    ownerId && uuid(deal.id)
      ? [`/api/inventory?dealId=${deal.id}&limit=1`, ownerId]
      : null,
    ownerInventoryFetcher,
    {
      keepPreviousData: false,
      revalidateOnFocus: true,
      shouldRetryOnError: false,
    },
  );
  const recorded =
    acquired ||
    existingPurchase?.items.some((item) => item.vehicleId === deal.id);
  const [pricePaid, setPricePaid] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });
  const [condition, setCondition] = useState(deal.condition || "unknown");
  const [error, setError] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const recordedLink = useRef<HTMLAnchorElement>(null);
  const retryId = useRef<string | null>(null);
  const title =
    [deal.year, deal.make, deal.model].filter(Boolean).join(" ") || "Vehicle";

  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      (recordedLink.current || opener.current)?.focus();
    };
  }, [open]);

  async function record(event: React.FormEvent) {
    event.preventDefault();
    if (loading || accountLoading || !ownerId || !isCurrentOwner()) return;
    const paid = actualAmount(pricePaid);
    if (paid === null) {
      setError(
        "Enter the actual purchase price paid with at most two decimal places (maximum $100,000,000).",
      );
      return;
    }
    setLoading(true);
    setError(null);
    try {
      retryId.current ??= purchaseRetryId(
        ownerId,
        deal.id || deal.vin || title,
      );
      const result = await writeInventory(ownerId, "POST", {
        id: retryId.current,
        purchaseDate,
        dealId: deal.id || undefined,
        vin: deal.vin || "",
        year: deal.year || 0,
        make: deal.make || "",
        model: deal.model || "",
        trim: deal.trim,
        condition,
        purchasePrice: paid,
        stage: "acquired",
        purchasedCity: deal.locationCity,
        purchasedState: deal.locationState,
      });
      if (!isCurrentOwner()) return;
      invalidateInventoryViews(ownerId);
      setAcquired(true);
      setOpen(false);
      if (result.outcomeReview?.synced === false)
        setError(result.outcomeReview.message);
      try {
        const status = await onRecorded?.();
        if (status === false) throw new Error("Unconfirmed shortlist status");
      } catch {
        if (!isCurrentOwner()) return;
        setError(
          "Purchase recorded. Saved-list status did not update; check Pipeline. Do not record it again.",
        );
      }
    } catch (error) {
      if (!isCurrentOwner()) return;
      setError(
        userFacingErrorMessage(
          error,
          "Purchase was not confirmed. Retry this form to check the same record, or review Pipeline.",
        ),
      );
    } finally {
      if (isCurrentOwner()) setLoading(false);
    }
  }

  return (
    <div className="min-w-0">
      {recorded ? (
        <Link
          ref={recordedLink}
          href="/fleet"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b2)] px-3 text-sm font-semibold text-[var(--t1)]"
        >
          <Check size={16} aria-hidden="true" /> Purchase recorded{" "}
          <ExternalLink size={14} aria-hidden="true" />
        </Link>
      ) : (
        <button
          ref={opener}
          type="button"
          onClick={() => setOpen(true)}
          disabled={
            accountLoading ||
            checkingPurchase ||
            !!purchaseCheckError ||
            !ownerId
          }
          className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-3 text-sm font-semibold text-[var(--t1)] ${className}`}
        >
          <Plus size={16} aria-hidden="true" />
          {checkingPurchase ? "Checking purchase record…" : label}
        </button>
      )}
      {purchaseCheckError && !recorded && (
        <div className="mt-2 text-xs text-[var(--t2)]">
          <p role="alert">
            Existing purchase status could not be checked. Review Pipeline
            before recording again.
          </p>
          <button
            type="button"
            className="mt-1 min-h-11 underline"
            onClick={() => void retryPurchaseCheck().catch(() => {})}
          >
            Retry purchase check
          </button>
        </div>
      )}
      {error && !open && (
        <p role="alert" className="mt-2 max-w-sm text-xs text-[var(--red)]">
          {error}
        </p>
      )}
      {open && (
        <dialog
          ref={dialog}
          aria-label="Record vehicle purchase"
          onCancel={(event) => {
            event.preventDefault();
            if (!loading) setOpen(false);
          }}
          className="fixed inset-0 m-auto w-[calc(100%-32px)] max-w-md max-h-[calc(100%-32px)] overflow-auto rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-5 text-[var(--t1)] backdrop:bg-black/50"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Record purchase</h2>
              <p className="mt-1 text-sm">{title}</p>
            </div>
            <button
              type="button"
              aria-label="Close purchase form"
              title="Close"
              disabled={loading}
              onClick={() => setOpen(false)}
              className="flex h-11 w-11 shrink-0 items-center justify-center"
            >
              <X size={20} />
            </button>
          </div>
          <p className="my-4 text-sm text-[var(--t3)]">
            Inventory record only. No bid or payment is submitted.
          </p>
          <form onSubmit={record}>
            <fieldset disabled={loading} className="min-w-0 space-y-4">
              <label className="block text-sm">
                Purchase price paid ($)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  max="100000000"
                  required
                  autoFocus
                  value={pricePaid}
                  onChange={(event) => setPricePaid(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3"
                />
              </label>
              <p className="text-xs text-[var(--t3)]">
                Use the amount actually paid. Asking prices, bids and monthly
                payments are different amounts.
              </p>
              <label className="block text-sm">
                Purchase date
                <input
                  type="date"
                  required
                  value={purchaseDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                  className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3"
                />
              </label>
              <label className="block text-sm">
                Recorded title / condition
                <select
                  value={condition}
                  onChange={(event) => setCondition(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-lg border border-[var(--b2)] bg-[var(--s1)] px-3"
                >
                  {Array.from(
                    new Set([
                      "unknown",
                      "clean",
                      "salvage",
                      "rebuilt",
                      "damaged",
                      "parts",
                      condition,
                    ]),
                  ).map((value) => (
                    <option key={value} value={value}>
                      {value.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              {error && (
                <p role="alert" className="text-sm text-[var(--red)]">
                  {error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="min-h-11 rounded-lg border border-[var(--b2)] px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--t1)] px-3 font-semibold text-[var(--s0)]"
                >
                  {loading && <Loader2 size={16} className="animate-spin" />}
                  {loading ? "Recording..." : "Confirm purchase record"}
                </button>
              </div>
            </fieldset>
          </form>
        </dialog>
      )}
    </div>
  );
}
