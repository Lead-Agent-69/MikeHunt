"use client";

// Low-friction outcome logging, tied to a specific deal. This is the loop that ACTIVATES the
// per-dealer calibration moat: the engine learns each dealer's real transport/recon/resale
// multipliers once they've logged 5+ sold flips, and bends every future estimate to their shop.
// We snapshot the engine's PREDICTED numbers here so calibration can compare predicted vs actual;
// the dealer only fills the actuals. Posts to the existing POST /api/outcomes.

import React from "react";
import { mutate } from "swr";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Ico } from "@/components/shared/Ico";

interface LogOutcomeProps {
  dealId: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  /** Best guess at what they'd pay — recommended max bid, else ask. Pre-fills purchase price. */
  defaultPurchase?: number | null;
  // Engine predictions, snapshotted for calibration (predicted vs actual).
  predictedProfit?: number | null;
  predictedSell?: number | null;
  predictedTransport?: number | null;
  predictedRecon?: number | null;
}

const round = (n?: number | null) =>
  n != null && !isNaN(Number(n)) ? String(Math.round(Number(n))) : "";

export function LogOutcome({
  dealId,
  year,
  make,
  model,
  defaultPurchase,
  predictedProfit,
  predictedSell,
  predictedTransport,
  predictedRecon,
}: LogOutcomeProps) {
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [done, setDone] = React.useState(false);
  const [f, setF] = React.useState({
    purchase_price: round(defaultPurchase),
    sell_price: "",
    days_to_sell: "",
    actual_recon: round(predictedRecon),
    actual_transport: round(predictedTransport),
    sold_where: "",
  });
  const set = (k: keyof typeof f, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function submit() {
    const purchase = Number(f.purchase_price);
    if (!purchase || purchase <= 0) {
      toast.error("Enter the price you actually bought it for");
      return;
    }
    setSaving(true);
    const body: Record<string, unknown> = {
      deal_id: dealId,
      year: year ?? undefined,
      make: make ?? undefined,
      model: model ?? undefined,
      purchase_price: purchase,
      predicted_profit: predictedProfit ?? undefined,
      predicted_sell: predictedSell ?? undefined,
      predicted_transport: predictedTransport ?? undefined,
      predicted_recon: predictedRecon ?? undefined,
    };
    for (const k of [
      "sell_price",
      "days_to_sell",
      "actual_recon",
      "actual_transport",
    ] as const) {
      const v = Number(f[k]);
      if (f[k] !== "" && !isNaN(v)) body[k] = v;
    }
    if (f.sold_where.trim()) body.sold_where = f.sold_where.trim();

    try {
      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(
          e.error ||
            (res.status === 401
              ? "Sign in to log outcomes"
              : "Could not save outcome"),
        );
      }
      toast.success(
        f.sell_price
          ? "Sale logged — it now calibrates your future estimates"
          : "Purchase logged — confirm the sale later to calibrate",
      );
      setDone(true);
      setOpen(false);
      // Refresh the dealer's calibration + win-patterns everywhere they're read.
      mutate("/api/calibration");
      mutate("/api/outcomes");
      mutate(`/api/deal-iq/${dealId}`);
    } catch (err) {
      toast.error((err as Error).message || "Could not save outcome");
    } finally {
      setSaving(false);
    }
  }

  const field = (
    key: keyof typeof f,
    label: string,
    opts: { prefix?: string; placeholder?: string; type?: string } = {},
  ) => (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-[var(--t4)] font-bold mb-1 block">
        {label}
      </label>
      <div className="relative">
        {opts.prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] text-sm">
            {opts.prefix}
          </span>
        )}
        <Input
          type={opts.type ?? "number"}
          inputMode={opts.type === "text" ? undefined : "numeric"}
          value={f[key]}
          onChange={(e) => set(key, e.target.value)}
          placeholder={opts.placeholder}
          className={opts.prefix ? "pl-7" : ""}
        />
      </div>
    </div>
  );

  return (
    <Card
      className="border-none overflow-hidden glass-panel relative"
      style={{
        background: "rgba(20,10,20,0.6)",
        backdropFilter: "blur(24px)",
        boxShadow: "var(--shadow)",
      }}
    >
      <CardContent className="p-6 md:p-7">
        <div className="flex items-center gap-2 mb-1">
          <Ico name="check-circle" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Track this flip
          </p>
          {done && (
            <span
              className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{ background: "var(--glo)", color: "var(--green)" }}
            >
              Logged ✓
            </span>
          )}
        </div>
        <p className="text-sm text-[var(--t3)] mb-5">
          Bought or sold this one? Log the real numbers. Every logged sale tunes
          future estimates to{" "}
          <span className="text-[var(--t1)]">your shop</span> — recon,
          transport, and resale calibrate to your actual results.
        </p>

        {!open ? (
          <Button
            onClick={() => setOpen(true)}
            className="text-white border-none"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="plus" size={15} className="mr-1.5" />
            {done ? "Log another outcome" : "Log outcome"}
          </Button>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {field("purchase_price", "Bought for *", { prefix: "$" })}
              {field("sell_price", "Sold for", {
                prefix: "$",
                placeholder: "leave blank if unsold",
              })}
              {field("days_to_sell", "Days to sell", { placeholder: "—" })}
              {field("sold_where", "Sold where", {
                type: "text",
                placeholder: "retail, auction, wholesale…",
              })}
              {field("actual_recon", "Actual recon", { prefix: "$" })}
              {field("actual_transport", "Actual transport", { prefix: "$" })}
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={submit}
                disabled={saving}
                className="text-white border-none"
                style={{ background: "var(--grad)" }}
              >
                {saving ? "Saving…" : "Save outcome"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={saving}
                className="text-[var(--t3)]"
              >
                Cancel
              </Button>
            </div>
            <p className="text-[11px] text-[var(--t5)]">
              Predicted profit{" "}
              {predictedProfit != null
                ? `$${Math.round(Number(predictedProfit)).toLocaleString()}`
                : "—"}{" "}
              is saved automatically so we can grade our estimate against your
              real result.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
