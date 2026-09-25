"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { MarketPulse } from "@/components/insights/MarketPulse";
import { SourceROI } from "@/components/insights/SourceROI";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) =>
  v == null || v === ""
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v));

const blank = {
  make: "",
  model: "",
  year: "",
  purchase_price: "",
  sell_price: "",
  actual_transport: "",
  actual_recon: "",
  actual_fees: "",
  days_to_sell: "",
  sold_where: "",
  notes: "",
};

export default function InsightsPage() {
  const { data: calData, mutate: mutateCal } = useSWR(
    "/api/calibration",
    fetcher,
    { revalidateOnFocus: false },
  );
  const {
    data: outData,
    error: outError,
    isLoading: outLoading,
    mutate: mutateOut,
  } = useSWR("/api/outcomes", fetcher, { revalidateOnFocus: false });
  const { data: roiData } = useSWR("/api/insights/source-roi", fetcher, {
    revalidateOnFocus: false,
  });
  const cal = calData?.calibration ?? null;
  const outcomes: any[] = outData?.outcomes ?? [];
  const loadFailed = !!outError || (outData && outData.error);

  const [form, setForm] = useState({ ...blank });
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.purchase_price) return;
    setSaving(true);
    try {
      const body: any = {};
      for (const [k, v] of Object.entries(form))
        if (v !== "")
          body[k] =
            isNaN(Number(v)) ||
            ["make", "model", "sold_where", "notes"].includes(k)
              ? v
              : Number(v);
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setForm({ ...blank });
        setOpen(false);
        mutateOut();
        mutateCal();
      }
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)] text-sm";

  return (
    <div
      className="max-w-4xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Intelligence
          </h1>
          <p className="text-[var(--t3)]">
            Log what your deals actually made. The engine calibrates to your
            real numbers.
          </p>
        </div>
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--r3)] font-bold text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{ background: "var(--amber)" }}
        >
          <Ico name={open ? "x" : "plus"} size={16} />
          {open ? "Cancel" : "Log a Sale"}
        </button>
      </div>

      {/* Load failure */}
      {loadFailed && (
        <div className="glass-panel p-6 text-center">
          <Ico
            name="alert-triangle"
            size={24}
            className="mx-auto text-[var(--red)] mb-2"
          />
          <p className="text-sm font-bold text-[var(--t1)]">
            Couldn&apos;t load your intelligence
          </p>
          <p className="text-xs text-[var(--t4)] mt-1">
            Refresh in a moment, or check you&apos;re signed in.
          </p>
        </div>
      )}

      {/* Loading */}
      {outLoading && !outData && !loadFailed && (
        <div className="glass-panel p-8 text-center text-[var(--t3)] text-sm">
          Loading your intelligence…
        </div>
      )}

      {/* AI Market Pulse — Deal IQ Layer 4 (explicit generate, cached) */}
      <MarketPulse />

      {/* Source ROI summary */}
      {!loadFailed && roiData?.bySource?.length > 0 && (
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ico name="finance" size={15} className="text-[var(--t4)]" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
              Source ROI
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {roiData.bySource.map((src: any) => (
              <div
                key={src.source}
                className="bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] p-3"
              >
                <p className="text-xs uppercase font-bold text-[var(--t3)] mb-1">
                  {src.source}
                </p>
                <div className="flex justify-between items-baseline">
                  <p className="text-sm font-semibold text-[var(--t1)]">
                    {src.count} deals
                  </p>
                  <p className="text-sm font-bold text-[var(--green)]">
                    {src.avgMargin > 0 ? "+" : ""}
                    {src.avgMargin}% ROI
                  </p>
                </div>
                <p className="text-xs text-[var(--t4)] mt-1">
                  Avg Net:{" "}
                  {src.avgNet > 0
                    ? `+$${src.avgNet.toLocaleString()}`
                    : `-$${Math.abs(src.avgNet).toLocaleString()}`}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Calibration summary */}
      {!loadFailed && !(outLoading && !outData) && (
        <div className="glass-panel p-5">
          <div className="flex items-center gap-2 mb-3">
            <Ico name="trending-up" size={15} className="text-[var(--t4)]" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
              Your calibration
            </p>
          </div>
          {cal ? (
            <>
              <p className="text-sm text-[var(--t2)] mb-4">{cal.message}</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "Logged deals", val: cal.sampleSize },
                  {
                    label: "Profit accuracy",
                    val: `${cal.profitAccuracyPct}%`,
                  },
                  {
                    label: "Transport vs base",
                    val: `${cal.transportMultiplier}×`,
                  },
                  { label: "Resale vs base", val: `${cal.sellMultiplier}×` },
                ].map((s) => (
                  <div key={s.label}>
                    <Mono
                      className="text-2xl font-black text-[var(--t1)]"
                      style={{ fontFamily: "var(--fm)" }}
                    >
                      {s.val}
                    </Mono>
                    <p className="text-[11px] text-[var(--t4)] font-semibold mt-0.5">
                      {s.label}
                    </p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-[var(--t4)]">
              Log at least 5 sold deals and the engine starts personalizing
              every max-bid and profit estimate to your actual costs. (
              {outcomes.length}/5 so far)
            </p>
          )}
        </div>
      )}

      {/* Source / channel ROI — where THIS dealer actually makes money (hides until logged) */}
      {!loadFailed && !(outLoading && !outData) && <SourceROI />}

      {/* Log form */}
      {open && (
        <form onSubmit={submit} className="glass-panel p-6 space-y-4">
          <h2 className="text-lg font-bold text-[var(--t1)]">
            Log a Deal Outcome
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Year
              </label>
              <input
                value={form.year}
                onChange={(e) => set("year", e.target.value)}
                className={inputClass}
                placeholder="2019"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Make
              </label>
              <input
                value={form.make}
                onChange={(e) => set("make", e.target.value)}
                className={inputClass}
                placeholder="Ford"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Model
              </label>
              <input
                value={form.model}
                onChange={(e) => set("model", e.target.value)}
                className={inputClass}
                placeholder="F-150"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Purchase price *
              </label>
              <input
                required
                value={form.purchase_price}
                onChange={(e) => set("purchase_price", e.target.value)}
                className={inputClass}
                placeholder="12000"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Sold price
              </label>
              <input
                value={form.sell_price}
                onChange={(e) => set("sell_price", e.target.value)}
                className={inputClass}
                placeholder="17500"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Days to sell
              </label>
              <input
                value={form.days_to_sell}
                onChange={(e) => set("days_to_sell", e.target.value)}
                className={inputClass}
                placeholder="21"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Actual transport
              </label>
              <input
                value={form.actual_transport}
                onChange={(e) => set("actual_transport", e.target.value)}
                className={inputClass}
                placeholder="650"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Actual recon
              </label>
              <input
                value={form.actual_recon}
                onChange={(e) => set("actual_recon", e.target.value)}
                className={inputClass}
                placeholder="900"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Other fees
              </label>
              <input
                value={form.actual_fees}
                onChange={(e) => set("actual_fees", e.target.value)}
                className={inputClass}
                placeholder="450"
              />
            </div>
            <div>
              <label className="block text-xs text-[var(--t3)] mb-1">
                Sold where
              </label>
              <input
                value={form.sold_where}
                onChange={(e) => set("sold_where", e.target.value)}
                className={inputClass}
                placeholder="lot / carmax / private"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-[var(--t3)] mb-1">
                Notes
              </label>
              <input
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="px-6 py-2 rounded-[var(--r3)] font-bold text-white bg-[var(--green)] hover:brightness-110 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save Outcome"}
            </button>
          </div>
        </form>
      )}

      {/* Recent outcomes */}
      <div className="space-y-3">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Logged deals
        </p>
        {outcomes.length === 0 ? (
          <div className="glass-panel p-8 text-center text-[var(--t4)] text-sm">
            No outcomes logged yet.
          </div>
        ) : (
          outcomes.map((o) => {
            const profit = o.actual_profit;
            const good = Number(profit) >= 0;
            return (
              <div
                key={o.id}
                className="glass-panel p-4 flex items-center justify-between gap-3"
              >
                <div>
                  <h3 className="font-bold text-[var(--t1)] text-sm">
                    {[o.year, o.make, o.model].filter(Boolean).join(" ") ||
                      "Vehicle"}
                  </h3>
                  <div className="text-xs text-[var(--t4)] flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    <span>Bought {money(o.purchase_price)}</span>
                    {o.sell_price != null && (
                      <span>Sold {money(o.sell_price)}</span>
                    )}
                    {o.days_to_sell != null && <span>{o.days_to_sell}d</span>}
                    {o.sold_where && <span>· {o.sold_where}</span>}
                  </div>
                </div>
                {profit != null && (
                  <Mono
                    className="text-lg font-black shrink-0"
                    style={{
                      fontFamily: "var(--fm)",
                      color: good ? "var(--green)" : "var(--red)",
                    }}
                  >
                    {good ? "+" : ""}
                    {money(profit)}
                  </Mono>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
