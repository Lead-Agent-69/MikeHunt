"use client";
import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { Calculator, Save, Wrench, Loader2 } from "lucide-react";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { useDealerId } from "@/hooks/useDealerId";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { budgetAmount, budgetTotal } from "@/lib/finance/budget";

const REPAIR = ["Parts", "Labor", "Inspection", "Transport", "Contingency"];
const TEARDOWN = [
  "Acquisition",
  "Dismantling labor",
  "Storage",
  "Transport",
  "Selling fees",
  "Disposal",
];
const money = (value: number | null) =>
  value === null
    ? "Not calculated"
    : value.toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PartsPage() {
  const { intent } = useBuyerIntent();
  const { dealerId, loading } = useDealerId();
  const {
    data: savedBudgets,
    error: readError,
    isLoading: reading,
    mutate,
  } = useSWR<
    {
      id: string;
      vehicle_name: string;
      total_estimate: number;
      parts_list: string[];
    }[]
  >(dealerId ? ["parts-budgets", dealerId] : null, async () => {
    const response = await fetch("/api/parts");
    const result = await response.json();
    if (!response.ok || !Array.isArray(result))
      throw new Error("Budgets unavailable");
    return result;
  });
  const allowTeardown =
    isFlipBuyerMode(intent?.buyerMode) || intent?.buyerMode === "parts";
  const [tab, setTab] = useState<"repair" | "teardown">("repair");
  const mode = allowTeardown ? tab : "repair";
  const [vehicle, setVehicle] = useState("");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [income, setIncome] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const fields = mode === "repair" ? REPAIR : TEARDOWN;
  const total = budgetTotal(fields.map((key) => amounts[key] ?? ""));
  const grossCents = budgetAmount(income);
  const gross = grossCents === null ? null : grossCents / 100;
  const margin = total === null || gross === null ? null : gross - total;
  function change(key: string, value: string) {
    setAmounts((prev) => ({ ...prev, [key]: value }));
    setFeedback("");
    setError("");
  }

  async function save() {
    if (
      pending ||
      total === null ||
      !vehicle.trim() ||
      (mode === "teardown" && gross === null)
    )
      return;
    setPending(true);
    setFeedback("");
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    const estimate = mode === "repair" ? total : gross!;
    const parts = [
      `Budget type: ${mode}`,
      ...fields.map((key) => `${key}: $${amounts[key]}`),
    ];
    try {
      const response = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_name: vehicle.trim(),
          total_estimate: estimate,
          parts_list: parts,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (
        !response.ok ||
        !result.id ||
        result.vehicle_name !== vehicle.trim() ||
        Number(result.total_estimate) !== estimate ||
        JSON.stringify(result.parts_list) !== JSON.stringify(parts)
      )
        throw new Error("Unconfirmed save");
      setFeedback(
        "Budget saved to your account. No repairs, sale or purchase were recorded.",
      );
      void mutate();
    } catch {
      setError(
        "Budget save was not confirmed. Your amounts are retained; reload before retrying.",
      );
    } finally {
      clearTimeout(timer);
      setPending(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 pb-28">
      <header className="border-b border-[var(--b1)] pb-4">
        <h1 className="text-2xl font-bold">Parts & Repair</h1>
        <p className="mt-2 text-sm text-[var(--t3)]">
          Budgets based on your entered amounts, not vehicle-specific valuations
          or repair quotes.
        </p>
      </header>
      {allowTeardown && (
        <div className="flex gap-2" role="group" aria-label="Budget type">
          {(["repair", "teardown"] as const).map((value) => (
            <button
              key={value}
              disabled={pending}
              type="button"
              aria-pressed={mode === value}
              onClick={() => {
                setTab(value);
                setFeedback("");
                setError("");
              }}
              className={`flex min-h-11 items-center gap-2 border px-3 text-sm font-semibold ${mode === value ? "border-[var(--t1)] bg-[var(--t1)] text-[var(--s0)]" : "border-[var(--b1)]"}`}
            >
              <Wrench className="h-4 w-4" aria-hidden="true" />
              {value === "repair" ? "Repair budget" : "Teardown budget"}
            </button>
          ))}
        </div>
      )}
      <fieldset disabled={pending} className="space-y-4">
        <legend className="sr-only">Budget amounts</legend>
        <label className="block text-sm font-semibold">
          Vehicle name
          <input
            value={vehicle}
            maxLength={200}
            onChange={(e) => {
              setVehicle(e.target.value);
              setFeedback("");
            }}
            className="field mt-2 block w-full"
            placeholder="Year, make and model"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((key) => (
            <label key={key} className="block text-sm font-semibold">
              {key} ($)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={amounts[key] ?? ""}
                onChange={(e) => change(key, e.target.value)}
                className="field mt-2 block w-full"
              />
            </label>
          ))}
          {mode === "teardown" && (
            <label className="block text-sm font-semibold">
              Expected gross parts receipts ($)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={income}
                onChange={(e) => {
                  setIncome(e.target.value);
                  setFeedback("");
                }}
                className="field mt-2 block w-full"
              />
            </label>
          )}
        </div>
      </fieldset>
      <section
        aria-label="Budget result"
        className="space-y-3 border-y border-[var(--b1)] py-4"
      >
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Calculator className="h-5 w-5" aria-hidden="true" />
          {mode === "repair" ? "Repair budget" : "Teardown scenario"}
        </h2>
        <div className="flex flex-wrap justify-between gap-2 text-sm">
          <span>Sum of entered costs</span>
          <strong>{money(total)}</strong>
        </div>
        {mode === "teardown" && (
          <>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Expected gross receipts</span>
              <strong>{money(gross)}</strong>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm">
              <span>Receipts minus entered costs</span>
              <strong>{money(margin)}</strong>
            </div>
          </>
        )}
        <p className="text-xs text-[var(--t3)]">
          Blank amounts are unknown. Enter zero only for a confirmed zero cost.{" "}
          {mode === "teardown"
            ? "Receipts are your assumption, not sold-price evidence or guaranteed profit. Taxes and unreported costs may reduce the result."
            : "Confirm the damage, safety, parts fitment and shop quote. This budget does not establish roadworthiness."}
        </p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-[var(--red)]">
          {error}
        </p>
      )}
      {feedback && (
        <p role="status" className="text-sm text-[var(--green)]">
          {feedback}
        </p>
      )}
      {!loading && !dealerId ? (
        <Link
          href="/login?next=%2Fparts"
          className="inline-flex min-h-11 items-center font-semibold text-[var(--blue)]"
        >
          Sign in to save budget
        </Link>
      ) : (
        <button
          type="button"
          disabled={
            pending ||
            loading ||
            !vehicle.trim() ||
            total === null ||
            (mode === "teardown" && gross === null)
          }
          onClick={save}
          className="inline-flex min-h-11 items-center gap-2 bg-[var(--t1)] px-4 text-sm font-semibold text-[var(--s0)] disabled:opacity-50"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {pending ? "Confirming..." : "Save budget"}
        </button>
      )}
      <div className="flex flex-wrap gap-4 border-t border-[var(--b1)] pt-4">
        <Link
          href="/fleet"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
        >
          {isFlipBuyerMode(intent?.buyerMode) ? "Pipeline" : "Purchase plan"}
        </Link>
        <Link
          href="/move"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
        >
          Transport estimate
        </Link>
      </div>
      {dealerId && (
        <section
          className="space-y-3 border-t border-[var(--b1)] pt-4"
          aria-label="Saved budgets"
        >
          <h2 className="text-base font-semibold">Saved budgets</h2>
          {reading ? (
            <p role="status" className="text-sm text-[var(--t3)]">
              Loading saved budgets...
            </p>
          ) : readError ? (
            <div role="alert" className="text-sm">
              <p>Saved budgets could not be loaded.</p>
              <button
                type="button"
                onClick={() => void mutate()}
                className="min-h-11 font-semibold text-[var(--blue)]"
              >
                Retry
              </button>
            </div>
          ) : !savedBudgets?.length ? (
            <p className="text-sm text-[var(--t3)]">No saved budgets.</p>
          ) : (
            <ul className="divide-y divide-[var(--b1)]">
              {savedBudgets.map((budget) => (
                <li key={budget.id} className="py-3">
                  <h3 className="text-sm font-semibold">
                    {budget.vehicle_name}
                  </h3>
                  <p className="mt-1 text-sm">
                    {budget.parts_list?.[0] === "Budget type: teardown"
                      ? "Expected gross receipts"
                      : budget.parts_list?.[0] === "Budget type: repair"
                        ? "Entered repair budget"
                        : "Legacy estimate (unverified)"}
                    : {money(Number(budget.total_estimate))}
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-[var(--t3)]">
                    {budget.parts_list?.slice(1).map((part, index) => (
                      <li key={index}>{part}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
