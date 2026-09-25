"use client";

import React from "react";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";
import { valueConfidence, CONFIDENCE_META } from "@/lib/valuation/confidence";
import type { ValuationBreakdown as VB } from "@/lib/scoring/deal-analyzer";

// "How we valued this" — the moat made transparent. Shows the EVIDENCE behind the resale number (real
// comps, KBB market value, completed sales) and the exact adjustments applied to THIS car (mileage,
// title/damage). No competitor shows their reasoning; this is what turns a number into trust — which
// matters most because it's the dealer's money.

const money = (v?: number | null) =>
  v == null ? "—" : `$${Math.round(v).toLocaleString()}`;

function Pct({ mult }: { mult: number }) {
  const pct = Math.round((mult - 1) * 100);
  if (pct === 0) return <span className="text-[var(--t4)]">—</span>;
  const up = pct > 0;
  return (
    <span style={{ color: up ? "var(--green)" : "var(--red)" }}>
      {up ? "+" : ""}
      {pct}%
    </span>
  );
}

export function ValuationBreakdown({
  v,
  sellEstimate,
}: {
  v: VB;
  sellEstimate: number;
}) {
  const conf = valueConfidence(v.basis, v.soldAnchored);
  const cm = CONFIDENCE_META[conf];
  const clean = v.cleanComp ?? v.baseline;
  const hasMileageAdj = Math.abs(v.mileageMult - 1) > 0.005;
  const hasTitleAdj = Math.abs(v.titleMult - 1) > 0.005;

  // Evidence chips — only what actually backs this number.
  const evidence: { icon: any; label: string }[] = [];
  if (v.compCount > 0)
    evidence.push({
      icon: "list",
      label: `${v.compCount} comparable listing${v.compCount === 1 ? "" : "s"}`,
    });
  if (v.kbbValue)
    evidence.push({
      icon: "calculator",
      label: `KBB market value ${money(v.kbbValue)}`,
    });
  if (v.soldCount > 0)
    evidence.push({
      icon: "check-circle",
      label: `${v.soldCount} recent real sale${v.soldCount === 1 ? "" : "s"}`,
    });
  if (evidence.length === 0)
    evidence.push({
      icon: "alert-triangle",
      label: "Offline estimate — thin market data",
    });

  return (
    <div
      className="rounded-[var(--r3)] p-5"
      style={{ background: "var(--s1)", boxShadow: "var(--shadow)" }}
    >
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--t4)]">
          How we valued this
        </p>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
          style={{ background: "var(--s2)", color: cm.color }}
          title={cm.blurb}
        >
          <span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: cm.color }}
          />
          {cm.label} confidence
        </span>
      </div>

      {/* Headline resale estimate */}
      <div className="flex items-baseline justify-between mb-4">
        <span className="text-sm text-[var(--t3)] font-semibold">
          Resale estimate
        </span>
        <Mono className="text-3xl font-black text-[var(--t1)]">
          {money(sellEstimate)}
        </Mono>
      </div>

      {/* Evidence */}
      <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--t4)] mb-2">
        Backed by
      </p>
      <div className="space-y-1.5 mb-4">
        {evidence.map((e, i) => (
          <div
            key={i}
            className="flex items-center gap-2 text-sm text-[var(--t2)]"
          >
            <Ico
              name={e.icon}
              size={14}
              className="shrink-0 text-[var(--t4)]"
            />
            {e.label}
          </div>
        ))}
      </div>

      {/* Adjustments — only when we actually moved the number for this specific car */}
      {(hasMileageAdj || hasTitleAdj) && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--t4)] mb-2">
            Adjusted for this car
          </p>
          <div
            className="rounded-[var(--r2)] p-3 text-sm space-y-1.5"
            style={{ background: "var(--s0)" }}
          >
            <Row label="Clean market value" value={money(clean)} />
            {hasMileageAdj && (
              <Row label="Mileage" value={<Pct mult={v.mileageMult} />} />
            )}
            {hasTitleAdj && (
              <Row
                label={`Title / damage${v.titleTag && v.titleTag !== "clean" ? ` (${v.titleTag})` : ""}`}
                value={<Pct mult={v.titleMult} />}
              />
            )}
            <div className="border-t border-[var(--b1)] !mt-2 pt-2">
              <Row
                label={
                  <span className="font-bold text-[var(--t1)]">
                    Resale estimate
                  </span>
                }
                value={
                  <Mono className="font-black text-[var(--t1)]">
                    {money(sellEstimate)}
                  </Mono>
                }
              />
            </div>
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] text-[var(--t4)] leading-relaxed">
        Built from our own multi-source market data — no paid feed. Sharpens as
        more comps and real sales come in.
      </p>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[var(--t3)]">{label}</span>
      <Mono className="text-[var(--t2)]">{value}</Mono>
    </div>
  );
}
