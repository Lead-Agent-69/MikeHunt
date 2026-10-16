"use client";

import React, { useMemo, useState } from "react";
import { Banknote, CalendarDays, Settings2 } from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface FloorPlanCalculatorProps {
  purchasePrice: number;
  expectedProfit: number;
}

const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);

export function FloorPlanCalculator({
  purchasePrice,
  expectedProfit,
}: FloorPlanCalculatorProps) {
  const [financedAmount, setFinancedAmount] = useState(
    Math.max(0, purchasePrice),
  );
  const [apr, setApr] = useState(10.5);
  const [upfrontFees, setUpfrontFees] = useState(75);
  const [dailyOverhead, setDailyOverhead] = useState(0);
  const [holdingDays, setHoldingDays] = useState(30);

  const model = useMemo(() => {
    const principal = Math.max(0, financedAmount);
    const dailyInterest = principal * (Math.max(0, apr) / 100 / 365);
    const dailyCarry = dailyInterest + Math.max(0, dailyOverhead);
    const costAt = (days: number) =>
      Math.max(0, upfrontFees) + dailyCarry * days;
    const profitAt = (days: number) => expectedProfit - costAt(days);
    const totalCarry = costAt(holdingDays);
    const breakEvenDays =
      dailyCarry > 0
        ? Math.max(
            0,
            Math.floor(
              (expectedProfit - Math.max(0, upfrontFees)) / dailyCarry,
            ),
          )
        : null;
    const points = Array.from({ length: 19 }, (_, index) => {
      const days = index * 5;
      return { days, profit: profitAt(days) };
    });
    return {
      dailyInterest,
      dailyCarry,
      totalCarry,
      netProfit: profitAt(holdingDays),
      breakEvenDays,
      points,
    };
  }, [
    apr,
    dailyOverhead,
    expectedProfit,
    financedAmount,
    holdingDays,
    upfrontFees,
  ]);

  return (
    <section
      aria-labelledby="floor-plan-title"
      className="overflow-hidden rounded-2xl border border-[var(--b1)] bg-[var(--s0)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--b1)] px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/15 text-cyan-400">
            <Banknote className="h-4 w-4" />
          </span>
          <div>
            <h3
              id="floor-plan-title"
              className="text-sm font-bold text-[var(--t1)]"
            >
              Floor plan &amp; carrying cost
            </h3>
            <p className="text-[11px] text-[var(--t4)]">
              Editable deal assumptions — confirm your lender&apos;s actual rate
              and fees.
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-wide text-[var(--t4)]">
            Profit after {holdingDays} days
          </p>
          <Mono
            className={`text-lg font-black ${model.netProfit >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"}`}
          >
            {money(model.netProfit)}
          </Mono>
        </div>
      </div>

      <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[minmax(16rem,0.85fr)_minmax(22rem,1.4fr)]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="Amount financed"
              value={financedAmount}
              onChange={setFinancedAmount}
              prefix="$"
            />
            <NumberField
              label="APR"
              value={apr}
              onChange={setApr}
              suffix="%"
              step="0.1"
            />
            <NumberField
              label="Opening / audit fees"
              value={upfrontFees}
              onChange={setUpfrontFees}
              prefix="$"
            />
            <NumberField
              label="Other daily carry"
              value={dailyOverhead}
              onChange={setDailyOverhead}
              prefix="$"
              step="0.01"
            />
          </div>
          <label className="block rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-3">
            <span className="flex items-center justify-between gap-2 text-xs font-semibold text-[var(--t3)]">
              <span className="flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" /> Expected days in
                inventory
              </span>
              <Mono className="text-sm text-cyan-400">{holdingDays} days</Mono>
            </span>
            <input
              aria-label="Expected days in inventory"
              type="range"
              min="1"
              max="90"
              value={holdingDays}
              onChange={(event) => setHoldingDays(Number(event.target.value))}
              className="mt-3 w-full accent-cyan-400"
            />
            <span className="mt-1 flex justify-between text-[9px] text-[var(--t5)]">
              <span>1 day</span>
              <span>30</span>
              <span>60</span>
              <span>90</span>
            </span>
          </label>
        </div>

        <div className="rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-3 sm:p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-[var(--t3)]">
                Profit erosion over time
              </h4>
              <p className="mt-1 text-[10px] text-[var(--t4)]">
                Drag the day slider to inspect the effect on this deal.
              </p>
            </div>
            <div className="flex gap-3 text-right text-[10px]">
              <div>
                <span className="block text-[var(--t4)]">Daily interest</span>
                <Mono>{money(model.dailyInterest)}</Mono>
              </div>
              <div>
                <span className="block text-[var(--t4)]">Daily carry</span>
                <Mono>{money(model.dailyCarry)}</Mono>
              </div>
            </div>
          </div>
          <ProfitCurve
            points={model.points}
            selectedDay={holdingDays}
            expectedProfit={expectedProfit}
          />
          <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-[var(--b1)] pt-3 text-[10px]">
            <div>
              <dt className="text-[var(--t4)]">Financing cost</dt>
              <dd className="mt-0.5 font-bold text-[var(--t2)]">
                {money(model.totalCarry)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--t4)]">Profit before financing</dt>
              <dd className="mt-0.5 font-bold text-[var(--t2)]">
                {money(expectedProfit)}
              </dd>
            </div>
            <div>
              <dt className="text-[var(--t4)]">Estimated break-even</dt>
              <dd className="mt-0.5 font-bold text-[var(--t2)]">
                {model.breakEvenDays == null || model.breakEvenDays > 365
                  ? "Not reached"
                  : `${model.breakEvenDays} days`}
              </dd>
            </div>
          </dl>
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-[var(--b1)] px-4 py-3 text-[10px] leading-relaxed text-[var(--t4)] sm:px-5">
        <Settings2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        These are planning inputs, not lender quotes. Interest uses simple daily
        APR; taxes, curtailments and lender-specific rules are included only if
        you add them to the fee or daily carry assumptions.
      </div>
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
  prefix,
  suffix,
  step = "1",
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  prefix?: string;
  suffix?: string;
  step?: string;
}) {
  return (
    <label className="rounded-xl border border-[var(--b1)] bg-[var(--s1)] p-3 text-[10px] font-semibold text-[var(--t4)]">
      {label}
      <span className="mt-1 flex items-center gap-1 text-sm font-bold text-[var(--t1)]">
        {prefix}
        <input
          aria-label={label}
          type="number"
          min="0"
          step={step}
          value={value}
          onChange={(event) =>
            onChange(Math.max(0, Number(event.target.value) || 0))
          }
          className="min-w-0 flex-1 bg-transparent outline-none"
        />
        {suffix}
      </span>
    </label>
  );
}

function ProfitCurve({
  points,
  selectedDay,
  expectedProfit,
}: {
  points: { days: number; profit: number }[];
  selectedDay: number;
  expectedProfit: number;
}) {
  const width = 640;
  const height = 150;
  const pad = 18;
  const values = [...points.map((point) => point.profit), 0, expectedProfit];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (days: number) => pad + (days / 90) * (width - pad * 2);
  const y = (profit: number) =>
    pad + ((max - profit) / span) * (height - pad * 2);
  const path = points
    .map(
      (point, index) =>
        `${index ? "L" : "M"}${x(point.days).toFixed(1)},${y(point.profit).toFixed(1)}`,
    )
    .join(" ");
  const selectedProfit =
    expectedProfit -
    (expectedProfit -
      points[0].profit +
      ((points[1].profit - points[0].profit) * -selectedDay) / 5);
  return (
    <div className="mt-3">
      <svg
        role="img"
        aria-label="Projected profit remaining over 90 days"
        viewBox={`0 0 ${width} ${height}`}
        className="h-36 w-full overflow-visible"
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={y(0)}
          y2={y(0)}
          stroke="var(--b2)"
          strokeDasharray="4 4"
        />
        <path
          d={path}
          fill="none"
          stroke="var(--cyan)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <line
          x1={x(selectedDay)}
          x2={x(selectedDay)}
          y1={pad}
          y2={height - pad}
          stroke="var(--amber)"
          strokeDasharray="3 3"
        />
        <circle
          cx={x(selectedDay)}
          cy={y(selectedProfit)}
          r="5"
          fill="var(--amber)"
        />
        {[0, 30, 60, 90].map((day) => (
          <text
            key={day}
            x={x(day)}
            y={height - 2}
            textAnchor={day === 0 ? "start" : day === 90 ? "end" : "middle"}
            fill="var(--t5)"
            fontSize="10"
          >
            {day}d
          </text>
        ))}
      </svg>
    </div>
  );
}
