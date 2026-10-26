"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import useSWR, { mutate as mutateCache } from "swr";
import Link from "next/link";
import {
  ownerInventoryFetcher,
  writeInventory,
  invalidateInventoryViews,
} from "@/lib/inventory/account-client";
import { useRecordOwner } from "@/hooks/useRecordOwner";
import { Panel } from "@/components/shared/Panel";
import { Tag } from "@/components/shared/Tag";
import { Mono } from "@/components/shared/Mono";
import { ErrorState } from "@/components/shared/ErrorState";
import { DataSetupState } from "@/components/shared/DataSetupState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { FleetKPIs } from "@/components/fleet/FleetKPIs";
import { CapitalVelocityTracker } from "@/components/fleet/CapitalVelocityTracker";
import { useDealerId } from "@/hooks/useDealerId";
import { isSupabaseConfigured } from "@/lib/supabase";
import { Clock3, X } from "lucide-react";
import { userFacingErrorMessage } from "@/lib/user-facing-error";
import { ImageGallery } from "@/components/shared/ImageGallery";

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
              CARRYING COST EXCEEDS PURCHASE COST
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
        Carrying cost equals purchase cost on day {breakEven} · ${rate}/day
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
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onSaved: (updatedItem: InventoryItem) => void;
}

function useRecordDialog(
  onClose: () => void,
  saving: boolean,
  returnFocus: HTMLElement | null,
) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => {
      element?.close();
      returnFocus?.focus();
    };
  }, [returnFocus]);
  return {
    ref: dialog,
    onCancel: (event: React.SyntheticEvent) => {
      event.preventDefault();
      if (!saving) onClose();
    },
  };
}

function ExpenseModal({
  item,
  onClose,
  onSaved,
  returnFocus,
}: ExpenseModalProps) {
  const [cat, setCat] = useState<ExpenseCategory>("repair");
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recordDialog = useRecordDialog(onClose, saving, returnFocus);
  const isCurrentOwner = useRecordOwner(item.dealerId);

  const handleSave = async () => {
    if (saving) return;
    const val = Number(amount);
    if (!amount.trim() || !Number.isFinite(val) || val <= 0) {
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
      const data = await writeInventory(item.dealerId, "PATCH", {
        id: item.id,
        expense: { category: cat, amount: val, expectedTotal: existing },
      });
      if (isCurrentOwner()) onSaved(data.item);
    } catch (e) {
      if (!isCurrentOwner()) return;
      setErr(
        userFacingErrorMessage(
          e,
          "Expense was not confirmed. Reload Pipeline before retrying to avoid counting it twice.",
        ),
      );
    } finally {
      if (isCurrentOwner()) setSaving(false);
    }
  };

  return (
    <dialog
      {...recordDialog}
      aria-label="Log vehicle expense"
      className="fixed inset-0 m-auto w-[calc(100%-32px)] max-w-md max-h-[calc(100%-32px)] overflow-auto rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-5 text-[var(--t1)] backdrop:bg-black/50"
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-sm" style={{ color: "var(--t1)" }}>
              Log Expense
            </h3>
            <p className="text-xs mt-0.5" style={{ color: "var(--t4)" }}>
              {item.year || ""} {item.make} {item.model}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close expense form"
            title="Close"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[var(--r3)]"
            style={{ color: "var(--t4)", background: "var(--s4)" }}
          >
            <X size={18} aria-hidden="true" />
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
                aria-pressed={cat === c.value}
                onClick={() => setCat(c.value)}
                className="min-h-11 py-2 px-2 rounded-[var(--r3)] text-xs font-semibold transition-all"
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
            htmlFor="expense-amount"
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
              id="expense-amount"
              autoFocus
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
            <p role="alert" className="text-xs" style={{ color: "var(--red)" }}>
              {err}
            </p>
          )}
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
      </fieldset>
    </dialog>
  );
}

// ─── Mark Sold Modal ──────────────────────────────────────────────────────────
interface MarkSoldModalProps {
  item: InventoryItem;
  returnFocus: HTMLElement | null;
  onClose: () => void;
  onSold: (updatedItem: InventoryItem, message: string) => void;
}

function MarkSoldModal({
  item,
  onClose,
  onSold,
  returnFocus,
}: MarkSoldModalProps) {
  const [price, setPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const recordDialog = useRecordDialog(onClose, saving, returnFocus);
  const isCurrentOwner = useRecordOwner(item.dealerId);

  const handleSold = async () => {
    if (saving) return;
    const val = Number(price);
    if (!price.trim() || !Number.isFinite(val) || val < 0) {
      setErr("Enter the actual non-negative sale price received");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const data = await writeInventory(item.dealerId, "PATCH", {
        id: item.id,
        stage: "sold",
        soldPrice: val,
      });
      if (isCurrentOwner())
        onSold(
          data.item,
          data.outcomeReview?.message ||
            "Sale saved. Review all actual costs in Outcomes and learning.",
        );
    } catch (e) {
      if (!isCurrentOwner()) return;
      setErr(
        userFacingErrorMessage(
          e,
          "We couldn't update this vehicle. Please try again.",
        ),
      );
    } finally {
      if (isCurrentOwner()) setSaving(false);
    }
  };

  const profit = Number(price) - item.totalCost;
  const hasPrice =
    price.trim() !== "" && Number.isFinite(Number(price)) && Number(price) >= 0;

  return (
    <dialog
      {...recordDialog}
      aria-label="Record vehicle sale"
      className="fixed inset-0 m-auto w-[calc(100%-32px)] max-w-md max-h-[calc(100%-32px)] overflow-auto rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-5 text-[var(--t1)] backdrop:bg-black/50"
    >
      <fieldset disabled={saving} className="min-w-0 space-y-4">
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
            aria-label="Close sale form"
            title="Close"
            className="w-11 h-11 shrink-0 flex items-center justify-center rounded-[var(--r3)]"
            style={{ color: "var(--t4)", background: "var(--s4)" }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="sale-price"
            className="block text-xs font-medium"
            style={{ color: "var(--t2)" }}
          >
            Actual sale price received ($)
          </label>
          <div className="relative">
            <span
              className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-mono"
              style={{ color: "var(--t4)" }}
            >
              $
            </span>
            <input
              id="sale-price"
              autoFocus
              type="number"
              min="0"
              step="0.01"
              className="field pl-7"
              placeholder="0.00"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setErr(null);
              }}
            />
          </div>
          {err && (
            <p role="alert" className="text-xs" style={{ color: "var(--red)" }}>
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
              Spread over inventory costs
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
        <p className="text-xs text-[var(--t3)]">
          Based on recorded costs only; excludes unrecorded expenses and
          estimated carrying costs. This records a completed sale, not a listing
          or payment.
        </p>

        <p className="text-xs text-[var(--t3)]">
          This preview uses the costs entered in Pipeline. Confirm every expense
          in Outcomes and learning before treating it as net profit.
        </p>

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
      </fieldset>
    </dialog>
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
  const [advanceError, setAdvanceError] = useState<string | null>(null);
  const [saleMessage, setSaleMessage] = useState("");
  const recordOpener = useRef<HTMLElement | null>(null);
  const isCurrentOwner = useRecordOwner(item.dealerId);

  const rate = item.dailyFloorRate > 0 ? item.dailyFloorRate : DAILY_FLOOR_RATE;
  const days = Math.max(
    0,
    Math.floor((now - new Date(item.floorDate).getTime()) / 86_400_000),
  );
  const isOpen = item.stage !== "sold" && item.stage !== "wholesale";
  const carryNow = isOpen ? days * rate : 0;
  const totalAll = item.totalCost;
  const mmr = item.marketValue ?? 0;
  const list = item.listPrice ?? 0;
  const refVal = mmr > 0 ? mmr : list > 0 ? list : 0;
  const estProfit = isOpen && refVal > 0 ? refVal - totalAll : null;
  const breakEven = item.totalCost > 0 ? Math.ceil(item.totalCost / rate) : 60;
  const isPast = isOpen && days > breakEven;

  const handleAdvance = useCallback(async () => {
    if (advancing) return;
    const idx = STAGE_ORDER.indexOf(item.stage as Stage);
    const next = STAGE_ORDER[idx + 1];
    if (!next) return;
    if (next === "sold") {
      recordOpener.current = document.activeElement as HTMLElement | null;
      setShowMarkSold(true);
      return;
    }
    setAdvancing(true);
    setAdvanceError(null);
    try {
      const data = await writeInventory(item.dealerId, "PATCH", {
        id: item.id,
        stage: next,
      });
      if (isCurrentOwner()) onUpdated(data.item);
    } catch {
      if (!isCurrentOwner()) return;
      setAdvanceError(
        "Stage change was not confirmed. Reload Pipeline before retrying.",
      );
    } finally {
      if (isCurrentOwner()) setAdvancing(false);
    }
  }, [
    item.id,
    item.dealerId,
    item.stage,
    advancing,
    onUpdated,
    isCurrentOwner,
  ]);

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
    {
      label: "Recorded holding",
      val: item.holdingCost,
      hide: !item.holdingCost,
      warn: false,
    },
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
              {item.vin
                ? `${item.vin.slice(0, 8)}…${item.vin.slice(-4)}`
                : "VIN not recorded"}
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

        {item.photos?.length > 0 && (
          <ImageGallery
            images={item.photos}
            title={[item.year || "", item.make, item.model]
              .filter(Boolean)
              .join(" ")}
          />
        )}
        {item.vehicleId && (
          <Link
            href={`/deal/${item.vehicleId}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--blue)]"
          >
            Review source listing →
          </Link>
        )}

        {/* Carrying Cost Clock */}
        {isOpen && <CarryingClock item={item} now={now} />}

        {/* Stage Tracker */}
        {isOpen && (
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
                  className="inline-flex items-center gap-1 text-xs"
                  style={{ color: row.warn ? "var(--amber)" : "var(--t4)" }}
                >
                  {row.warn ? (
                    <Clock3 className="h-3 w-3" aria-hidden="true" />
                  ) : null}
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
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
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
              Recorded inventory costs
            </span>
            <Mono
              className="text-sm font-bold"
              style={{ color: "var(--t1)" } as React.CSSProperties}
            >
              $
              {totalAll.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </Mono>
          </div>
          {isOpen && (
            <p className="mt-2 text-xs text-[var(--t3)]">
              Modeled holding to date: ${carryNow.toLocaleString()}. Estimate at
              ${rate}/day; review actual holding expenses separately.
            </p>
          )}
          {estProfit !== null && (
            <div className="flex items-center justify-between mt-1">
              <span
                className="text-xs font-medium"
                style={{ color: "var(--t4)" }}
              >
                Spread to reference
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
        {advanceError && (
          <p role="alert" className="text-xs text-[var(--red)]">
            {advanceError}
          </p>
        )}
        {isOpen && (
          <div className="flex gap-2">
            <button
              onClick={(event) => {
                recordOpener.current = event.currentTarget;
                setShowExpense(true);
              }}
              className="flex-1 py-2 rounded-xl text-xs font-semibold transition-colors border-none text-[var(--t2)]"
              style={{ background: "var(--s2)" }}
            >
              Log Expense
            </button>
            <button
              onClick={(event) => {
                recordOpener.current = event.currentTarget;
                setShowMarkSold(true);
              }}
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
        {saleMessage && (
          <p
            role="status"
            className="rounded-lg border border-[var(--b2)] p-3 text-sm text-[var(--t2)]"
          >
            {saleMessage}{" "}
            <Link
              href="/insights"
              className="inline-flex min-h-11 items-center underline"
            >
              Review outcome records
            </Link>
          </p>
        )}
      </div>

      {showExpense && (
        <ExpenseModal
          item={item}
          returnFocus={recordOpener.current}
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
          returnFocus={recordOpener.current}
          onClose={() => setShowMarkSold(false)}
          onSold={(u, message) => {
            setSaleMessage(message);
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
    <DataSetupState
      title="Your purchase pipeline starts here"
      message="Keep candidates in Saved. Once you buy a vehicle, record the purchase from its detail page to track transport, repairs, costs, and its outcome here."
      primaryHref="/market"
      primaryLabel="Find a vehicle to buy"
      secondaryHref="/saved"
      secondaryLabel="Review saved candidates"
      compact
    />
  );
}

function FleetSetupState({ signedIn }: { signedIn: boolean }) {
  return (
    <DataSetupState
      title={
        signedIn
          ? "Add a vehicle to start your pipeline"
          : "Sign in to track acquired units"
      }
      message={
        signedIn
          ? "Your pipeline tracks purchased vehicles: transport, repairs, carrying costs, list price, offers, and the final outcome. Add one from your saved vehicles when you are ready."
          : "Sign in to keep your purchase records private. After buying a vehicle, record it from its detail page."
      }
      primaryHref={signedIn ? "/market" : "/login"}
      primaryLabel={signedIn ? "Find vehicles" : "Sign in"}
      secondaryHref="/market"
      secondaryLabel="Find vehicles"
      compact
    />
  );
}

function EmptyFleetFilter({ label }: { label: string }) {
  return (
    <Panel className="overflow-hidden p-0">
      <div className="p-5 md:p-6">
        <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
          Stage empty
        </p>
        <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
          No units in {label}
        </h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
          This stage will fill as acquired units move through transport, recon,
          listed, offer, and sold. Use All to see the whole pipeline.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Acquired", "Recon", "Sold"].map((step) => (
            <div
              key={step}
              className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2"
            >
              <div className="text-xs font-black text-[var(--t1)]">{step}</div>
              <div className="mt-0.5 text-[11px] text-[var(--t5)]">
                Track cost, status, and outcome.
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function FleetPageHeader({ count }: { count: number }) {
  return (
    <header className="border-b border-[var(--b1)] pb-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="mt-1 text-xl font-black text-[var(--t1)] md:text-2xl">
            Pipeline
          </h1>
        </div>
        {count > 0 && (
          <span className="w-fit rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t3)]">
            {count} unit{count !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </header>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function FleetPage() {
  const { dealerId, loading } = useDealerId();
  return (
    <FleetWorkspace
      key={dealerId || "signed-out"}
      dealerId={dealerId}
      dealerLoading={loading}
    />
  );
}

function FleetWorkspace({
  dealerId,
  dealerLoading,
}: {
  dealerId: string | null;
  dealerLoading: boolean;
}) {
  const [now, setNow] = useState(Date.now());
  const [filter, setFilter] = useState<"all" | Stage>("all");
  const configured = isSupabaseConfigured();

  const isCurrentOwner = useRecordOwner(dealerId);

  const {
    data,
    error: fetchError,
    isLoading,
    mutate,
  } = useSWR(
    configured && dealerId && !dealerLoading
      ? ([`/api/inventory?limit=100`, dealerId] as [string, string])
      : null,
    ownerInventoryFetcher,
    { keepPreviousData: false },
  );

  const fleet = useMemo(
    () => (data?.ownerId === dealerId ? data.items : []) as InventoryItem[],
    [data, dealerId],
  );
  const needsSignIn = configured && !dealerLoading && !dealerId;
  const error = !configured
    ? null
    : dealerId
      ? fetchError?.message || null
      : null;
  const loading = configured && (dealerLoading || isLoading);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const handleUpdated = useCallback(
    (updated: InventoryItem) => {
      if (!isCurrentOwner() || updated.dealerId !== dealerId) return;
      void mutate(
        (current) =>
          current?.ownerId === dealerId
            ? {
                ...current,
                items: current.items.map((f) =>
                  f.id === updated.id ? updated : f,
                ),
              }
            : current,
        { revalidate: false },
      );
      if (dealerId) {
        invalidateInventoryViews(dealerId, "/api/inventory?limit=100");
        void mutateCache(["/api/outcomes", dealerId]);
        void mutateCache(["/api/calibration", dealerId]);
        void mutateCache(["/api/insights/source-roi", dealerId]);
      }
    },
    [mutate, dealerId, isCurrentOwner],
  );

  const stats = useMemo(() => {
    const active = fleet.filter(
      (f) => f.stage !== "sold" && f.stage !== "wholesale",
    );
    const totalInvested = fleet.reduce((a, f) => a + f.totalCost, 0);
    const referenced = active.filter(
      (f) =>
        Number.isFinite(f.marketValue ?? f.listPrice) &&
        (f.marketValue ?? f.listPrice ?? 0) > 0,
    );
    const referenceSpread = referenced.length
      ? referenced.reduce(
          (sum, f) => sum + (f.marketValue ?? f.listPrice)! - f.totalCost,
          0,
        )
      : null;
    return {
      total: fleet.length,
      recon: fleet.filter((f) => f.stage === "recon").length,
      listed: fleet.filter((f) => f.stage === "listed" || f.stage === "offer")
        .length,
      totalInvested,
      referenceSpread,
      referenceCount: referenced.length,
      activeCount: active.length,
    };
  }, [fleet]);

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
      <FleetPageHeader count={!loading && !error ? fleet.length : 0} />

      {/* Deep KPI rollup — margin, days-to-sell, recon, live ghost cost, bottleneck (the flip loop) */}
      {!loading && !error && fleet.length > 0 && <FleetKPIs fleet={fleet} />}

      {/* Capital velocity: days-in-stage, capital deployed, floor-plan burn (uses /api/inventory + /api/outcomes) */}
      {!loading && !error && fleet.length > 0 && (
        <CapitalVelocityTracker inventory={fleet} />
      )}

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
              label: "Recorded costs",
              value: stats.totalInvested,
              color: "var(--t1)",
              fmt: "money",
              detail: "Excludes unrecorded expenses",
            },
            {
              label: "Reference spread",
              value: stats.referenceSpread,
              color: "var(--t1)",
              fmt: "money",
              detail: `${stats.referenceCount} of ${stats.activeCount} active units · before unrecorded costs`,
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
                {s.value === null
                  ? "—"
                  : s.fmt === "money"
                    ? `${s.value < 0 ? "-" : ""}$${Math.abs(s.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : s.value}
              </Mono>
              {s.detail && (
                <p className="mt-1 text-[10px] text-[var(--t4)]">{s.detail}</p>
              )}
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
          title="Fleet data is unavailable"
          message={error}
          onRetry={() => mutate()}
        />
      )}

      {!configured && !loading && <FleetSetupState signedIn />}
      {needsSignIn && !loading && <FleetSetupState signedIn={false} />}

      {/* Empty */}
      {configured &&
        !needsSignIn &&
        !loading &&
        !error &&
        fleet.length === 0 && <EmptyFleet />}

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
        <EmptyFleetFilter label={STAGE_LABELS[filter] ?? filter} />
      )}
    </div>
  );
}
