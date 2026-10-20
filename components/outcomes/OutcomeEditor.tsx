"use client";
import React from "react";
import {
  ACTUAL_COST_FIELDS,
  LEDGER_MONEY_FIELDS,
  actualCostFields,
  ledgerTotals,
  validateOutcome,
  sameOutcomeActuals,
  type LedgerRow,
} from "@/lib/outcomes/ledger";

const money = (v: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
type Props = {
  ownerId: string;
  record?: LedgerRow;
  dealId?: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  onSaved: (record: LedgerRow) => void;
  onCancel: () => void;
  onReload?: (recordId: string) => void | Promise<unknown>;
};
export function OutcomeEditor({
  ownerId,
  record,
  dealId,
  year,
  make,
  model,
  onSaved,
  onCancel,
  onReload,
}: Props) {
  const id = React.useId();
  const recordId = React.useRef(record?.id ?? null);
  const [fields, setFields] = React.useState(
    () =>
      ({
        ...Object.fromEntries(
          LEDGER_MONEY_FIELDS.map((key) => [
            key,
            record?.[key] == null ? "" : String(record[key]),
          ]),
        ),
        purchased_at: record?.purchased_at?.slice(0, 10) ?? "",
        sold_at: record?.sold_at?.slice(0, 10) ?? "",
        year: String(record?.year ?? year ?? ""),
        make: record?.make ?? make ?? "",
        model: record?.model ?? model ?? "",
        sold_where: record?.sold_where ?? "",
        notes: record?.notes ?? "",
      }) as Record<string, string>,
  );
  const [confirmed, setConfirmed] = React.useState(
    record?.costs_complete === true,
  );
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [conflict, setConflict] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);
  const activeOwner = React.useRef<string | null>(ownerId);
  React.useEffect(() => {
    activeOwner.current = ownerId;
    return () => {
      activeOwner.current = null;
    };
  }, [ownerId]);
  const input = {
    ...fields,
    year: fields.year === "" ? null : Number(fields.year),
    costs_complete: confirmed,
  };
  const validated = validateOutcome(input);
  const totals = ledgerTotals(validated.row);
  const set = (key: string, value: string) => {
    setFields((f) => ({ ...f, [key]: value }));
    setConfirmed(false);
    setErrors((e) => ({ ...e, [key]: "" }));
  };
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setErrors(validated.errors);
    if (!validated.valid) return;
    recordId.current ??= crypto.randomUUID();
    setSaving(true);
    try {
      const response = await fetch("/api/outcomes", {
        signal: AbortSignal.timeout(30000),
        method: record ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
          "x-outcome-owner": ownerId,
        },
        body: JSON.stringify({
          ...input,
          id: recordId.current,
          revision: record?.revision,
          deal_id: record?.deal_id ?? dealId ?? null,
          inventory_id: record?.inventory_id ?? null,
        }),
      });
      const result = await response.json();
      if (activeOwner.current !== ownerId) return;
      if (!response.ok) {
        setConflict(response.status === 409);
        setErrors(result.fields ?? {});
        throw new Error(result.error || "The record could not be saved.");
      }
      const saved = result.outcome;
      if (
        result.success !== true ||
        saved?.id !== recordId.current ||
        saved.user_id !== ownerId ||
        !Number.isInteger(saved?.revision) ||
        saved.revision < 1 ||
        !sameOutcomeActuals(
          saved,
          validated.row,
          !dealId && !record?.deal_id && !record?.inventory_id,
        )
      )
        throw new Error(
          "Save was not confirmed. Retry with this same record before creating another.",
        );
      onSaved(saved);
    } catch (e) {
      if (activeOwner.current !== ownerId) return;
      setError(
        e instanceof Error
          ? e.message
          : "Save was not confirmed. Retry this record.",
      );
    } finally {
      if (activeOwner.current === ownerId) setSaving(false);
    }
  }
  async function reloadSaved() {
    if (!onReload || reloading || !recordId.current) return;
    setReloading(true);
    try {
      await onReload(recordId.current);
    } catch {
      if (activeOwner.current === ownerId)
        setError(
          "The saved version could not be loaded. Your draft is still here. Retry reload when connected.",
        );
    } finally {
      if (activeOwner.current === ownerId) setReloading(false);
    }
  }
  function field(key: string, label: string, type = "text", required = false) {
    return (
      <div className="min-w-0" key={key}>
        <label
          htmlFor={`${id}-${key}`}
          className="block text-sm font-semibold text-[var(--t1)]"
        >
          {label}
          {required ? " *" : ""}
        </label>
        <input
          id={`${id}-${key}`}
          data-outcome-field={key}
          type={type}
          inputMode={
            LEDGER_MONEY_FIELDS.includes(key as never)
              ? "decimal"
              : key === "year"
                ? "numeric"
                : undefined
          }
          value={fields[key]}
          onChange={(e) => set(key, e.target.value)}
          disabled={saving}
          aria-invalid={!!errors[key]}
          aria-describedby={errors[key] ? `${id}-${key}-error` : undefined}
          className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-3 text-base text-[var(--t1)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        />
        {errors[key] && (
          <p
            id={`${id}-${key}-error`}
            className="mt-1 text-xs text-[var(--red)]"
          >
            {errors[key]}
          </p>
        )}
      </div>
    );
  }
  return (
    <form
      onSubmit={submit}
      noValidate
      data-testid="outcome-editor"
      className="min-w-0 space-y-5 rounded-xl border border-[var(--b2)] bg-[var(--s1)] p-4 sm:p-5"
    >
      <div>
        <h3 className="text-lg font-bold">
          {record ? "Update actual outcome" : "Record actual outcome"}
        </h3>
        <p className="mt-1 text-sm text-[var(--t3)]">
          Owner-reported amounts from your records. Enter the vehicle purchase
          and sale prices before fees. Leave the sale blank until sold.
        </p>
      </div>
      {!dealId && !record?.deal_id && !record?.inventory_id ? (
        <div className="grid gap-3 sm:grid-cols-3">
          {field("year", "Year")}
          {field("make", "Make")}
          {field("model", "Model")}
        </div>
      ) : (
        <p className="break-words text-sm font-semibold text-[var(--t1)]">
          {[record?.year ?? year, record?.make ?? make, record?.model ?? model]
            .filter(Boolean)
            .join(" ") || "Linked vehicle"}
        </p>
      )}
      <fieldset>
        <legend className="mb-3 text-sm font-bold">Purchase and sale</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          {field("purchase_price", "Actual purchase price ($)", "text", true)}
          {field("purchased_at", "Purchase date", "date")}
          {field("sell_price", "Actual sale price ($)")}
          {field("sold_at", "Sale date", "date")}
          {field("sold_where", "Sale channel")}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold">Actual expenses</legend>
        {!record?.costs_complete && Number(record?.actual_fees) > 0 && (
          <p className="mb-3 rounded-lg border border-[var(--b2)] p-3 text-sm text-[var(--t2)]">
            The earlier record has {money(Number(record?.actual_fees))} in
            combined fees. Allocate those fees to the categories below before
            confirming. Count each fee once.
          </p>
        )}
        <p className="mb-3 text-xs text-[var(--t3)]">
          Enter the amounts paid, including 0 for costs that do not apply.
          Include every fee once. Do not use a quote or forecast as an actual
          expense.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {actualCostFields.map((key) =>
            field(key, `${ACTUAL_COST_FIELDS[key]} ($)`),
          )}
        </div>
      </fieldset>
      {field("notes", "Notes / receipt reference")}
      <label className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--b2)] p-3 text-sm">
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          checked={confirmed}
          disabled={saving}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          I reviewed the dates and every actual expense against my records,
          including zero costs.
        </span>
      </label>
      {errors.costs_complete && (
        <p className="text-sm text-[var(--red)]">{errors.costs_complete}</p>
      )}
      <div
        data-testid="outcome-summary"
        className="rounded-lg bg-[var(--s0)] p-4 text-sm"
      >
        {totals.profit != null ? (
          <>
            <p>Recorded net result before income tax</p>
            <p
              className={`mt-1 font-mono text-2xl font-bold ${totals.profit < 0 ? "text-[var(--red)]" : "text-[var(--t1)]"}`}
            >
              {money(totals.profit)}
            </p>
            <p className="mt-2 text-[var(--t3)]">
              All-in cost {money(totals.totalCost!)} · ROI{" "}
              {totals.roiPct!.toFixed(1)}% · {totals.daysToSell} days
            </p>
          </>
        ) : (
          <p className="text-[var(--t3)]">
            {fields.sell_price
              ? "Sale recorded amounts need all costs and valid dates confirmed before net profit can count toward learning."
              : "Save the purchase now and update this same record after the sale. Net profit stays unavailable until the sale and all costs are confirmed."}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--t3)]">
          A complete cost record is owner-reported evidence; it does not
          independently verify a vehicle or establish a buy recommendation.
        </p>
      </div>
      {error && (
        <div role="alert" className="text-sm text-[var(--red)]">
          <p>{error}</p>
          {conflict && onReload && (
            <button
              type="button"
              onClick={reloadSaved}
              disabled={reloading}
              className="mt-2 min-h-11 rounded-lg border border-[var(--b2)] px-3 font-semibold text-[var(--t1)]"
            >
              {reloading ? "Reloading..." : "Reload saved version"}
            </button>
          )}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving || conflict}
          className="min-h-11 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-[var(--on-accent)] disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save actual outcome"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="min-h-11 rounded-lg border border-[var(--b2)] px-4 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
