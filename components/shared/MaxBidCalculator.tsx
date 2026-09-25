"use client";

import { useState } from "react";
import { Mono } from "./Mono";

interface MaxBidCalculatorProps {
  deal: {
    year?: number;
    make?: string;
    model?: string;
    askPrice: number;
    sellEstimate?: number;
    recommendedMaxBid?: number;
    repairEstimate?: number;
    transportEstimate?: number;
  };
}

export function MaxBidCalculator({ deal }: MaxBidCalculatorProps) {
  // Default estimates from deal analyzer
  const defaultRepair = deal.repairEstimate ?? 800;
  const defaultTransport = deal.transportEstimate ?? 600;
  const defaultSellEstimate = deal.sellEstimate ?? deal.askPrice * 1.25;

  const [customRepair, setCustomRepair] = useState(defaultRepair);
  const [customTransport, setCustomTransport] = useState(defaultTransport);
  const [customSellEstimate, setCustomSellEstimate] =
    useState(defaultSellEstimate);
  const [targetROI, setTargetROI] = useState(20); // 20% default

  // Selling fees (~9% of sale price: reconditioning to retail, selling fees, holding costs)
  const sellingFees = Math.round(customSellEstimate * 0.09);

  // Calculate max bid: work backwards from target profit
  // sell - (repair + transport + selling fees + acquisition) = profit
  // profit / total cost = ROI
  // solve for: acquisition = sell / (1 + ROI) - fixed costs
  const fixedCosts = customRepair + customTransport + sellingFees;
  const targetROIDecimal = targetROI / 100;
  const maxTotal = customSellEstimate / (1 + targetROIDecimal);
  const maxBid = Math.max(0, Math.round(maxTotal - fixedCosts));

  // Expected profit if you pay the max bid
  const expectedProfit = Math.round(customSellEstimate - maxBid - fixedCosts);

  // How far off from platform recommendation
  const platformMaxBid = deal.recommendedMaxBid ?? 0;
  const difference = maxBid - platformMaxBid;
  const showDifference = platformMaxBid > 0 && Math.abs(difference) > 100;

  return (
    <div className="glass-panel p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-[var(--t1)]">
          Max Bid Calculator
        </h3>
        <div className="text-xs text-[var(--t4)] text-right leading-tight">
          Target {targetROI}% ROI
        </div>
      </div>

      {/* Platform Recommendation */}
      {platformMaxBid > 0 && (
        <div
          className="p-4 rounded-[var(--r3)]"
          style={{
            background: "var(--s2)",
            border: "1px solid var(--b2)",
          }}
        >
          <div className="text-xs text-[var(--t3)] mb-1 font-semibold uppercase tracking-wider">
            Platform Recommendation
          </div>
          <Mono className="text-3xl font-black text-[var(--amber)]">
            ${platformMaxBid.toLocaleString()}
          </Mono>
          <div className="text-xs text-[var(--t4)] mt-1">
            Based on market data + 20% ROI target
          </div>
        </div>
      )}

      {/* Editable Inputs */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
            Expected Sell Price
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono text-sm">
              $
            </span>
            <input
              type="number"
              value={customSellEstimate}
              onChange={(e) =>
                setCustomSellEstimate(Math.max(0, Number(e.target.value)))
              }
              className="w-full pl-7 pr-3 py-2.5 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{
                background: "var(--s1)",
                border: "1px solid var(--b2)",
              }}
            />
          </div>
          <div className="text-xs text-[var(--t4)] mt-1">
            What you expect to sell for (retail)
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
            Repair / Recon Cost
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono text-sm">
              $
            </span>
            <input
              type="number"
              value={customRepair}
              onChange={(e) =>
                setCustomRepair(Math.max(0, Number(e.target.value)))
              }
              className="w-full pl-7 pr-3 py-2.5 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{
                background: "var(--s1)",
                border: "1px solid var(--b2)",
              }}
            />
          </div>
          <div className="text-xs text-[var(--t4)] mt-1">
            Body work, mechanical, detailing
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
            Transport Cost
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono text-sm">
              $
            </span>
            <input
              type="number"
              value={customTransport}
              onChange={(e) =>
                setCustomTransport(Math.max(0, Number(e.target.value)))
              }
              className="w-full pl-7 pr-3 py-2.5 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{
                background: "var(--s1)",
                border: "1px solid var(--b2)",
              }}
            />
          </div>
          <div className="text-xs text-[var(--t4)] mt-1">
            Shipping from seller to your lot
          </div>
        </div>

        <div>
          <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
            Target ROI (%)
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="50"
              step="5"
              value={targetROI}
              onChange={(e) => setTargetROI(Number(e.target.value))}
              className="flex-1"
              style={{
                accentColor: "var(--amber)",
              }}
            />
            <Mono className="text-lg font-bold text-[var(--t1)] w-12 text-right">
              {targetROI}%
            </Mono>
          </div>
          <div className="text-xs text-[var(--t4)] mt-1">
            Your minimum profit margin
          </div>
        </div>
      </div>

      {/* Calculated Max Bid */}
      <div
        className="p-5 rounded-[var(--r3)]"
        style={{
          background: "linear-gradient(135deg, var(--s2) 0%, var(--s1) 100%)",
          border: "2px solid var(--amber)",
        }}
      >
        <div className="text-xs text-[var(--t3)] mb-2 font-semibold uppercase tracking-wider">
          Your Custom Max Bid
        </div>
        <Mono className="text-4xl font-black text-[var(--amber)] mb-2">
          ${maxBid.toLocaleString()}
        </Mono>
        <div className="text-sm text-[var(--t2)] font-medium">
          Expected profit:{" "}
          <Mono className="text-[var(--green)] font-bold">
            +${expectedProfit.toLocaleString()}
          </Mono>
        </div>

        {showDifference && (
          <div
            className="mt-3 pt-3 border-t"
            style={{ borderColor: "var(--b2)" }}
          >
            <div className="text-xs text-[var(--t4)]">
              {difference > 0 ? (
                <span>
                  <span style={{ color: "var(--amber)" }}>
                    ↑ ${Math.abs(difference).toLocaleString()} higher
                  </span>{" "}
                  than platform
                </span>
              ) : (
                <span>
                  <span style={{ color: "var(--green)" }}>
                    ↓ ${Math.abs(difference).toLocaleString()} lower
                  </span>{" "}
                  than platform
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cost Breakdown */}
      <div
        className="p-4 rounded-[var(--r2)] space-y-2"
        style={{ background: "var(--s1)" }}
      >
        <div className="text-xs text-[var(--t3)] font-semibold uppercase tracking-wider mb-3">
          Cost Breakdown
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[var(--t3)]">Sell Price</span>
          <Mono className="text-[var(--t1)] font-semibold">
            ${customSellEstimate.toLocaleString()}
          </Mono>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[var(--t3)]">− Max Bid</span>
          <Mono className="text-[var(--t3)] font-semibold">
            −${maxBid.toLocaleString()}
          </Mono>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[var(--t3)]">− Repair</span>
          <Mono className="text-[var(--t3)] font-semibold">
            −${customRepair.toLocaleString()}
          </Mono>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[var(--t3)]">− Transport</span>
          <Mono className="text-[var(--t3)] font-semibold">
            −${customTransport.toLocaleString()}
          </Mono>
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-[var(--t3)]">− Selling Fees (9%)</span>
          <Mono className="text-[var(--t3)] font-semibold">
            −${sellingFees.toLocaleString()}
          </Mono>
        </div>

        <div
          className="flex justify-between text-sm pt-2 mt-2 border-t"
          style={{ borderColor: "var(--b2)" }}
        >
          <span className="text-[var(--t1)] font-bold">Net Profit</span>
          <Mono className="text-[var(--green)] font-bold">
            +${expectedProfit.toLocaleString()}
          </Mono>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-[var(--t4)]">ROI</span>
          <Mono className="text-[var(--t2)] font-semibold">{targetROI}%</Mono>
        </div>
      </div>

      {/* Warning if bid is too high */}
      {maxBid > deal.askPrice && (
        <div
          className="p-3 rounded-[var(--r2)] flex items-start gap-2"
          style={{
            background: "var(--amber-lo)",
            border: "1px solid var(--amber)",
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--amber-d)"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="shrink-0 mt-0.5"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div className="text-xs text-[var(--amber-d)] leading-relaxed">
            <strong>Note:</strong> Your max bid (${maxBid.toLocaleString()}) is
            higher than the asking price (${deal.askPrice.toLocaleString()}).
            You may want to adjust your sell estimate or target ROI.
          </div>
        </div>
      )}
    </div>
  );
}
