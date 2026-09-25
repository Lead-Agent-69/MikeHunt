"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr-config";
import { Panel } from "@/components/shared/Panel";
import { EmptyState } from "@/components/shared/EmptyState";
import { Tag } from "@/components/shared/Tag";
import { Mono } from "@/components/shared/Mono";
import { ErrorState } from "@/components/shared/ErrorState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { FleetKPIs } from "@/components/fleet/FleetKPIs";
import { useDealerId } from "@/hooks/useDealerId";

// ─── Constants ───────────────────────────────────────────────────────────────
const DAILY_FLOOR_RATE = 35;
const STAGE_ORDER = [
  "acquired",
  "transport",
  "recon",
  "listed",
  "offer",
  "sold",
] as const;
type Stage = (typeof STAGE_ORDER)[number];

const STAGE_LABELS: Record<string, string> = {
  acquired: "Acquired",
  transport: "Transport",
  recon: "Recon",
  listed: "Listed",
  offer: "Offer",
  sold: "Sold",
};

// ─── Shimmer skeleton ─────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div
      className="panel p-5 space-y-4"
      style={{ animation: "pulse 1.8s ease-in-out infinite" }}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div
            className="h-4 w-40 rounded-[var(--r2)]"
            style={{ background: "var(--s4)" }}
          />
          <div
            className="h-3 w-24 rounded-[var(--r2)]"
            style={{ background: "var(--s3)" }}
          />
        </div>
        <div
          className="h-5 w-16 rounded-[var(--r2)]"
          style={{ background: "var(--s4)" }}
        />
      </div>
      <div
        className="h-2 w-full rounded-full"
        style={{ background: "var(--s3)" }}
      />
      <div className="flex gap-2">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="flex-1 h-5 rounded-[var(--r2)]"
            style={{ background: "var(--s3)" }}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-[var(--r3)]"
            style={{ background: "var(--s3)" }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Carrying Cost Clock ──────────────────────────────────────────────────────
interface CarryingClockProps {
  item: InventoryItem;
  now: number;
}

function CarryingClock({ item, now }: CarryingClockProps) {
  const floorMs = now - new Date(item.floorDate).getTime();
  const days = Math.max(0, Math.floor(floorMs / 86_400_000));
  const rate = item.dailyFloorRate > 0 ? item.dailyFloorRate : DAILY_FLOOR_RATE;
  const costSoFar = days * rate;
  const breakEven = item.totalCost > 0 ? Math.ceil(item.totalCost / rate) : 60;
  const isPast = days > breakEven;
  const pct = Math.min(1, days / Math.max(breakEven, 30));
  const isHot = pct >= 0.8;

  const barColor = isPast
    ? "var(--red)"
    : isHot
      ? "var(--amber)"
      : "var(--green)";

  return (
    <div
      className="rounded-[var(--r3)] p-3 space-y-2"
      style={{
        background: isPast ? "var(--rlo)" : "var(--s3)",
        border: `1px solid ${isPast ? "var(--rbd)" : "var(--b1)"}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isPast ? "var(--red)" : "var(--amber)"}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              animation: isPast ? "pulse 1s ease-in-out infinite" : undefined,
            }}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span
            className="text-xs font-semibold"
            style={{ color: isPast ? "var(--red)" : "var(--t2)" }}
          >
            {days}d on floor
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isPast && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "var(--rlo)",
                color: "var(--red)",
                border: "1px solid var(--rbd)",
                animation: "pulse 1.5s ease-in-out infinite",
              }}
            >
              ⚠ PAST BREAK-EVEN
            </span>
          )}
          <Mono
            className="text-xs font-bold"
            style={
              {
                color: isPast ? "var(--red)" : "var(--t1)",
              } as React.CSSProperties
            }
          >
            ${costSoFar.toLocaleString()}
          </Mono>
        </div>
      </div>

      <div
        className="relative h-1.5 w-full rounded-full overflow-hidden"
        style={{ background: "var(--s5)" }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{ width: `${pct * 100}%`, background: barColor }}
        />
      </div>

      <p className="text-[10px]" style={{ color: "var(--t4)" }}>
        Break-even: day {breakEven} · ${rate}/day floor rate
      </p>
    </div>
  );
}

// ─── Stage Tracker ────────────────────────────────────────────────────────────
interface StageTrackerProps {
  currentStage: string;
  onAdvance: () => void;
  advancing: boolean;
}

function StageTracker({
  currentStage,
  onAdvance,
  advancing,
}: StageTrackerProps) {
  const currentIdx = STAGE_ORDER.indexOf(currentStage as Stage);
  const isTerminal = currentStage === "sold" || currentStage === "wholesale";
  const nextStage =
    !isTerminal && currentIdx < STAGE_ORDER.length - 1
      ? STAGE_ORDER[currentIdx + 1]
      : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-0">
        {STAGE_ORDER.map((stage, i) => {
          const isActive = stage === currentStage;
          const isPast = i < currentIdx;
          const isNext = i === currentIdx + 1;
          const first = i === 0;
          const last = i === STAGE_ORDER.length - 1;
          return (
            <div
              key={stage}
              className="flex-1 min-w-0 text-center text-[10px] font-semibold truncate transition-all py-1"
              style={{
                background: isActive
                  ? "var(--amber-lo)"
                  : isPast
                    ? "var(--s2)"
                    : "var(--s1)",
                color: isActive
                  ? "var(--amber)"
                  : isPast
                    ? "var(--t2)"
                    : isNext
                      ? "var(--t3)"
                      : "var(--t5)",
                borderTop: `1px solid ${isActive ? "var(--amber-bd)" : isPast ? "var(--b2)" : "var(--b1)"}`,
                borderBottom: `1px solid ${isActive ? "var(--amber-bd)" : isPast ? "var(--b2)" : "var(--b1)"}`,
                borderLeft: first
                  ? `1px solid ${isActive ? "var(--amber-bd)" : isPast ? "var(--b2)" : "var(--b1)"}`
                  : "none",
                borderRight: last
                  ? `1px solid ${isActive ? "var(--amber-bd)" : isPast ? "var(--b2)" : "var(--b1)"}`
                  : "none",
                borderRadius: first
                  ? "0.5rem 0 0 0.5rem"
                  : last
                    ? "0 0.5rem 0.5rem 0"
                    : "0",
              }}
            >
              {isActive ? "● " : isPast ? "✓ " : ""}
              {STAGE_LABELS[stage]}
            </div>
          );
        })}
      </div>

      {nextStage && (
        <button
          onClick={onAdvance}
          disabled={advancing}
          className="w-full text-xs font-bold py-2 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 border-none text-[var(--coral)] disabled:opacity-50"
          style={{ background: "var(--clo)" }}
        >
          {advancing ? (
            <>
              <span
                className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full"
                style={{ animation: "spin 0.7s linear infinite" }}
              />
              Updating…
            </>
          ) : (
            <>
              Advance to {STAGE_LABELS[nextStage]}
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ─── Expense Modal ────────────────────────────────────────────────────────────
import React from "react";

type ExpenseCategory = "transport" | "repair" | "recon" | "title" | "other";
const EXPENSE_CATS: { value: ExpenseCategory; label: string }[] = [
  { value: "transport", label: "Transport" },
  { value: "repair", label: "Repair" },
  { value: "recon", label: "Recon" },
  { value: "title", label: "Title / Fees" },
  { value: "other", label: "Other" },
];

interface ExpenseModalProps {
  item: InventoryItem;
  onClose: () => void;
  onSaved: (updatedItem: InventoryItem) => void;
}

function ExpenseModal({ item, onClose, onSaved }: ExpenseModalProps) {
  const [cat, setCat] = useState<ExpenseCategory>("repair");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSave = async () => {
    const val = parseFloat(amount);
    if (!amount || isNaN(val) || val <= 0) {
      setErr("Enter a valid amount");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const fieldMap: Record<ExpenseCategory, string> = {
        transport: "transportCost",
        repair: "repairCost",
        recon: "reconCost",
        title: "titleFee",
        other: "otherCosts",
      };
      const field = fieldMap[cat];
      const existing = (item as any)[field] ?? 0;
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, [field]: existing + val }),
      });
      const data = await res.json();
      if (data.item) onSaved(data.item);
      else setErr(data.error || "Failed to save");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(7,7,10,.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md panel p-5 space-y-4"
        style={{ animation: "popIn 180ms var(--ease-out) both" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm" style={{ color: "var(--t1)" }}>
              Log Expense
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
              {item.year} {item.make} {item.model}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--r3)]"
            style={{ color: "var(--t4)", background: "var(--s4)" }}
          >
            ✕
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium"
            style={{ color: "var(--t2)" }}
          >
            Category
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {EXPENSE_CATS.map((c) => (
              <button
                key={c.value}
                onClick={() => setCat(c.value)}
                className="py-2 px-2 rounded-[var(--r3)] text-xs font-semibold transition-all"
                style={{
                  background: cat === c.value ? "var(--amber-lo)" : "var(--s4)",
                  color: cat === c.value ? "var(--amber)" : "var(--t3)",
                  border: `1px solid ${cat === c.value ? "var(--amber-bd)" : "var(--b1)"}`,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium"
            style={{ color: "var(--t2)" }}
          >
            Amount ($)
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono"
              style={{ color: "var(--t4)" }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="field pl-7"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setErr(null);
              }}
            />
          </div>
          {err && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {err}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium"
            style={{ color: "var(--t2)" }}
          >
            Note (optional)
          </label>
          <input
            type="text"
            className="field"
            placeholder="e.g. New rear brakes"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none text-[var(--t2)]"
            style={{ background: "var(--s2)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white border-none disabled:opacity-50"
            style={{ background: "var(--grad)" }}
          >
            {saving ? (
              <span
                className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                style={{ animation: "spin 0.7s linear infinite" }}
              />
            ) : (
              "Save Expense"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Mark Sold Modal ──────────────────────────────────────────────────────────
interface MarkSoldModalProps {
  item: InventoryItem;
  onClose: () => void;
  onSold: (updatedItem: InventoryItem) => void;
}

function MarkSoldModal({ item, onClose, onSold }: MarkSoldModalProps) {
  const [price, setPrice] = useState(item.listPrice?.toString() ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const handleSold = async () => {
    const val = parseFloat(price);
    if (!price || isNaN(val) || val <= 0) {
      setErr("Enter a valid sale price");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, stage: "sold", soldPrice: val }),
      });
      const data = await res.json();
      if (data.item) onSold(data.item);
      else setErr(data.error || "Failed to mark sold");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  };

  const profit = parseFloat(price) - item.totalCost;
  const hasPrice = !isNaN(parseFloat(price)) && parseFloat(price) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(7,7,10,.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md panel p-5 space-y-4"
        style={{ animation: "popIn 180ms var(--ease-out) both" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm" style={{ color: "var(--t1)" }}>
              Mark as Sold
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
              {item.year} {item.make} {item.model}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-[var(--r3)]"
            style={{ color: "var(--t4)", background: "var(--s4)" }}
          >
            ✕
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            className="block text-xs font-medium"
            style={{ color: "var(--t2)" }}
          >
            Sale Price ($)
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono"
              style={{ color: "var(--t4)" }}
            >
              $
            </span>
            <input
              type="number"
              min="0"
              step="100"
              className="field pl-7"
              placeholder={item.listPrice?.toString() ?? "0"}
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setErr(null);
              }}
            />
          </div>
          {err && (
            <p className="text-xs" style={{ color: "var(--red)" }}>
              {err}
            </p>
          )}
        </div>

        {hasPrice && (
          <div
            className="rounded-[var(--r3)] p-3 flex items-center justify-between"
            style={{
              background: profit >= 0 ? "var(--glo)" : "var(--rlo)",
              border: `1px solid ${profit >= 0 ? "var(--gbd)" : "var(--rbd)"}`,
            }}
          >
            <span
              className="text-xs font-medium"
              style={{ color: "var(--t3)" }}
            >
              {profit >= 0 ? "🟢 Profit" : "🔴 Loss"}
            </span>
            <Mono
              className="text-sm font-bold"
              style={
                {
                  color: profit >= 0 ? "var(--green)" : "var(--red)",
                } as React.CSSProperties
              }
            >
              {profit >= 0 ? "+" : ""}$
              {profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Mono>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border-none text-[var(--t2)]"
            style={{ background: "var(--s2)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSold}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 text-white border-none disabled:opacity-50"
            style={{ background: "var(--grad)" }}
          >
            {saving ? (
              <span
                className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full"
                style={{ animation: "spin 0.7s linear infinite" }}
              />
            ) : (
              "Confirm Sale"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fleet Unit Card ──────────────────────────────────────────────────────────
interface UnitCardProps {
  item: InventoryItem;
  now: number;
  onUpdated: (updated: InventoryItem) => void;
}

function UnitCard({ item, now, onUpdated }: UnitCardProps) {
  const [advancing, setAdvancing] = useState(false);
  const [showExpense, setShowExpense] = useState(false);
  const [showMarkSold, setShowMarkSold] = useState(false);

  const rate = item.dailyFloorRate > 0 ? item.dailyFloorRate : DAILY_FLOOR_RATE;
  const days = Math.max(
    0,
    Math.floor((now - new Date(item.floorDate).getTime()) / 86_400_000),
  );
  const carryNow = days * rate;
  const totalAll = item.totalCost + carryNow;
  const mmr = item.marketValue ?? 0;
  const list = item.listPrice ?? 0;
  const refVal = mmr > 0 ? mmr : list > 0 ? list : 0;
  const estProfit = refVal > 0 ? refVal - totalAll : null;
  const breakEven = item.totalCost > 0 ? Math.ceil(item.totalCost / rate) : 60;
  const isPast = days > breakEven;

  const handleAdvance = useCallback(async () => {
    const idx = STAGE_ORDER.indexOf(item.stage as Stage);
    const next = STAGE_ORDER[idx + 1];
    if (!next) return;
    setAdvancing(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, stage: next }),
      });
      const data = await res.json();
      if (data.item) onUpdated(data.item);
    } finally {
      setAdvancing(false);
    }
  }, [item.id, item.stage, onUpdated]);

  const costRows = [
    { label: "Purchase", val: item.purchasePrice, hide: false, warn: false },
    {
      label: "Auction",
      val: item.auctionFee,
      hide: !item.auctionFee,
      warn: false,
    },
    {
      label: "Transport",
      val: item.transportCost,
      hide: !item.transportCost,
      warn: false,
    },
    {
      label: "Repair",
      val: item.repairCost,
      hide: !item.repairCost,
      warn: false,
    },
    { label: "Recon", val: item.reconCost, hide: !item.reconCost, warn: false },
    { label: "Title", val: item.titleFee, hide: !item.titleFee, warn: false },
    {
      label: "Other",
      val: item.otherCosts,
      hide: !item.otherCosts,
      warn: false,
    },
    { label: "Carrying", val: carryNow, hide: false, warn: true },
  ].filter((r) => !r.hide);

  return (
    <>
      <div
        className="panel p-5 space-y-4 transition-all duration-300 reveal-on-scroll"
        style={{
          borderColor: isPast ? "var(--rbd)" : undefined,
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3
              className="font-bold text-[15px] leading-tight"
              style={{ color: "var(--t1)" }}
            >
              {item.year} {item.make} {item.model}
              {item.trim ? (
                <span className="font-normal" style={{ color: "var(--t4)" }}>
                  {" "}
                  · {item.trim}
                </span>
              ) : null}
            </h3>
            <p
              className="text-xs mt-0.5 font-mono"
              style={{ color: "var(--t4)" }}
            >
              {item.vin.slice(0, 8)}…{item.vin.slice(-4)}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Tag
              color={
                item.stage === "sold"
                  ? "green"
                  : item.stage === "listed"
                    ? "blue"
                    : item.stage === "offer"
                      ? "amber"
                      : isPast
                        ? "red"
                        : "amber"
              }
            >
              {STAGE_LABELS[item.stage] ?? item.stage}
            </Tag>
            {item.odometer != null && (
              <span className="text-[10px]" style={{ color: "var(--t5)" }}>
                {item.odometer.toLocaleString()} mi
              </span>
            )}
          </div>
        </div>

        {/* Carrying Cost Clock */}
        {item.stage !== "sold" && <CarryingClock item={item} now={now} />}

        {/* Stage Tracker */}
        {item.stage !== "sold" && (
          <StageTracker
            currentStage={item.stage}
            onAdvance={handleAdvance}
            advancing={advancing}
          />
        )}

        {/* Cost breakdown */}
        <div>
          <p
            className="text-[10px] uppercase font-semibold mb-2"
            style={{ color: "var(--t5)", letterSpacing: "0.08em" }}
          >
            Cost Breakdown
          </p>
          <div className="space-y-1">
            {costRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between"
              >
                <span
                  className="text-xs"
                  style={{ color: row.warn ? "var(--amber)" : "var(--t4)" }}
                >
                  {row.warn ? "⏱ " : ""}
                  {row.label}
                </span>
                <Mono
                  className="text-xs"
                  style={
                    {
                      color: row.warn ? "var(--amber)" : "var(--t3)",
                    } as React.CSSProperties
                  }
                >
                  $
                  {row.val.toLocaleString(undefined, {
                    maximumFractionDigits: 0,
                  })}
                </Mono>
              </div>
            ))}
          </div>
          <div
            className="flex items-center justify-between mt-2 pt-2"
            style={{ borderTop: "1px solid var(--b1)" }}
          >
            <span className="text-xs font-bold" style={{ color: "var(--t2)" }}>
              Total All-In
            </span>
            <Mono
              className="text-sm font-bold"
              style={{ color: "var(--t1)" } as React.CSSProperties}
            >
              $
              {totalAll.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </Mono>
          </div>
          {estProfit !== null && (
            <div className="flex items-center justify-between mt-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--t4)" }}
              >
                Est. Profit
              </span>
              <Mono
                className="text-sm font-bold"
                style={
                  {
                    color: estProfit >= 0 ? "var(--green)" : "var(--red)",
                  } as React.CSSProperties
                }
              >
                {estProfit >= 0 ? "+" : ""}$
                {estProfit.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}
              </Mono>
            </div>
          )}
        </div>

        {/* Action buttons */}
        {item.stage !== "sold" && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowExpense(true)}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors border-none text-[var(--t2)]"
              style={{ background: "var(--s2)" }}
            >
              Log Expense
            </button>
            <button
              onClick={() => setShowMarkSold(true)}
              className="flex-1 py-2 rounded-xl text-xs font-bold transition-colors border-none text-[var(--green)]"
              style={{ background: "var(--glo)" }}
            >
              Mark Sold ✓
            </button>
          </div>
        )}

        {/* Sold banner */}
        {item.stage === "sold" && item.soldPrice != null && (
          <div
            className="rounded-[var(--r3)] p-3 flex items-center justify-between"
            style={{ background: "var(--glo)", border: "1px solid var(--gbd)" }}
          >
            <span
              className="text-xs font-medium"
              style={{ color: "var(--green)" }}
            >
              Sold for
            </span>
            <Mono
              className="font-bold text-sm"
              style={{ color: "var(--green)" } as React.CSSProperties}
            >
              ${item.soldPrice.toLocaleString()}
            </Mono>
          </div>
        )}
      </div>

      {showExpense && (
        <ExpenseModal
          item={item}
          onClose={() => setShowExpense(false)}
          onSaved={(u) => {
            onUpdated(u);
            setShowExpense(false);
          }}
        />
      )}
      {showMarkSold && (
        <MarkSoldModal
          item={item}
          onClose={() => setShowMarkSold(false)}
          onSold={(u) => {
            onUpdated(u);
            setShowMarkSold(false);
          }}
        />
      )}
    </>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyFleet() {
  return (
    <Panel padding="none">
      <EmptyState
        icon="fleet"
        title="No vehicles yet"
        message="Deals you buy will appear here — scan the market and add one to your fleet."
        action={{ label: "Find Deals", href: "/scan" }}
      />
    </Panel>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FleetPage() {
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | Stage>("all");

  const { dealerId, loading: dealerLoading } = useDealerId();

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(
    dealerId && !dealerLoading
      ? `/api/inventory?dealerId=${dealerId}&limit=100`
      : null,
    fetcher,
  );

  const fleet = (data?.items || []) as InventoryItem[];
  const error = dealerId
    ? fetchError?.message || data?.error || null
    : "Please sign in to view your fleet.";
  const loading = dealerLoading || isLoading;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleUpdated = useCallback(
    (updated: InventoryItem) => {
      mutate(
        {
          ...data,
          items: fleet.map((f) => (f.id === updated.id ? updated : f)),
        },
        false,
      );
    },
    [fleet, data, mutate],
  );

  const stats = useMemo(() => {
    const active = fleet.filter(
      (f) => f.stage !== "sold" && f.stage !== "wholesale",
    );
    const totalInvested = fleet.reduce((a, f) => a + f.totalCost, 0);
    const totalCarry = active.reduce((a, f) => {
      const d = Math.max(
        0,
        Math.floor((now - new Date(f.floorDate).getTime()) / 86_400_000),
      );
      const r = f.dailyFloorRate > 0 ? f.dailyFloorRate : DAILY_FLOOR_RATE;
      return a + d * r;
    }, 0);
    const estProfit = fleet.reduce((a, f) => {
      const mv = f.marketValue ?? f.listPrice ?? 0;
      return mv > 0 ? a + mv - f.totalCost : a;
    }, 0);
    return {
      total: fleet.length,
      recon: fleet.filter((f) => f.stage === "recon").length,
      listed: fleet.filter((f) => f.stage === "listed" || f.stage === "offer")
        .length,
      totalInvested,
      totalCarry,
      estProfit,
    };
  }, [fleet, now]);

  const FILTER_TABS: Array<{ key: "all" | Stage; label: string }> = [
    { key: "all", label: "All" },
    { key: "acquired", label: "Acquired" },
    { key: "transport", label: "Transport" },
    { key: "recon", label: "Recon" },
    { key: "listed", label: "Listed" },
    { key: "offer", label: "Offer" },
    { key: "sold", label: "Sold" },
  ];

  const filteredFleet = useMemo(
    () => (filter === "all" ? fleet : fleet.filter((f) => f.stage === filter)),
    [fleet, filter],
  );

  return (
    <div className="space-y-5 pb-24">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black" style={{ color: "var(--t1)" }}>
            Fleet Dashboard
          </h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
            Live carrying cost tracking for every unit on your lot
          </p>
        </div>
        {!loading && !error && fleet.length > 0 && (
          <span
            className="text-xs font-mono px-2 py-1 rounded-[var(--r2)]"
            style={{ background: "var(--s3)", color: "var(--t4)" }}
          >
            {fleet.length} unit{fleet.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Deep KPI rollup — margin, days-to-sell, recon, live ghost cost, bottleneck (the flip loop) */}
      {!loading && !error && fleet.length > 0 && <FleetKPIs fleet={fleet} />}

      {/* Stats row */}
      {!loading && !error && fleet.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            {
              label: "Total Units",
              value: stats.total,
              color: "var(--t1)",
              fmt: "num",
            },
            {
              label: "In Recon",
              value: stats.recon,
              color: "var(--blue)",
              fmt: "num",
            },
            {
              label: "Listed / Offer",
              value: stats.listed,
              color: "var(--amber)",
              fmt: "num",
            },
            {
              label: "Total Invested",
              value: stats.totalInvested + stats.totalCarry,
              color: "var(--red)",
              fmt: "money",
            },
            {
              label: "Est. Profit",
              value: stats.estProfit,
              color: stats.estProfit >= 0 ? "var(--green)" : "var(--red)",
              fmt: "money",
            },
          ].map((s) => (
            <Panel key={s.label} padding="sm" className="text-center">
              <p
                className="text-[10px] uppercase font-semibold mb-1"
                style={{ color: "var(--t5)", letterSpacing: "0.07em" }}
              >
                {s.label}
              </p>
              <Mono
                className="text-lg font-black"
                style={{ color: s.color } as React.CSSProperties}
              >
                {s.fmt === "money"
                  ? `${s.value < 0 ? "-" : ""}$${Math.abs(s.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                  : s.value}
              </Mono>
            </Panel>
          ))}
        </div>
      )}

      {/* Filter tabs */}
      {!loading && !error && fleet.length > 0 && (
        <div
          className="flex gap-1.5 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTER_TABS.map((f) => {
            const count =
              f.key === "all"
                ? fleet.length
                : fleet.filter((item) => item.stage === f.key).length;
            const isActive = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--r3)] text-xs font-semibold transition-all"
                style={{
                  background: isActive ? "var(--amber-lo)" : "var(--s3)",
                  color: isActive ? "var(--amber)" : "var(--t4)",
                  border: `1px solid ${isActive ? "var(--amber-bd)" : "var(--b1)"}`,
                }}
              >
                {f.label}
                {count > 0 && (
                  <span
                    className="text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full"
                    style={{
                      background: isActive ? "var(--amber-bd)" : "var(--s5)",
                      color: isActive ? "var(--amber)" : "var(--t4)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <ErrorState
          title="Failed to load fleet"
          message={error}
          onRetry={() => mutate()}
        />
      )}

      {/* Empty */}
      {!loading && !error && fleet.length === 0 && <EmptyFleet />}

      {/* Unit grid */}
      {!loading && !error && filteredFleet.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredFleet.map((item) => (
            <UnitCard
              key={item.id}
              item={item}
              now={now}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}

      {/* Empty filtered state */}
      {!loading && !error && fleet.length > 0 && filteredFleet.length === 0 && (
        <Panel className="text-center py-10">
          <p className="text-sm" style={{ color: "var(--t4)" }}>
            No units in {STAGE_LABELS[filter] ?? filter} stage
          </p>
        </Panel>
      )}
    </div>
  );
}
