"use client";

import { useState } from "react";

interface MaxBidCalculatorProps {
  deal: {
    year: number;
    make: string;
    model: string;
    askPrice: number;
    sellEstimate: number;
    recommendedMaxBid: number;
    repairEstimate: number;
    transportEstimate: number;
  };
}

export function MaxBidCalculator({ deal }: MaxBidCalculatorProps) {
  const [customRepair, setCustomRepair] = useState(deal.repairEstimate);
  const [customTransport, setCustomTransport] = useState(
    deal.transportEstimate,
  );
  const [targetROI, setTargetROI] = useState(0.2);

  // Recalculate max bid with custom inputs
  const fixedCosts = customRepair + customTransport + deal.sellEstimate * 0.09;
  const maxTotal = deal.sellEstimate / (1 + targetROI);
  const maxBid = Math.max(0, Math.round(maxTotal - fixedCosts));

  return (
    <div className="glass-panel p-6">
      <h3 className="text-xl font-bold mb-4">Max Bid Calculator</h3>

      {/* Platform recommendation */}
      <div className="mb-6 p-4 rounded-lg bg-[var(--s2)]">
        <div className="text-sm text-[var(--t3)] mb-1">
          Platform Recommendation
        </div>
        <div className="text-3xl font-bold text-[var(--amber)]">
          ${deal.recommendedMaxBid.toLocaleString()}
        </div>
        <div className="text-sm text-[var(--t4)] mt-1">
          Based on 20% ROI target
        </div>
      </div>

      {/* Editable inputs */}
      <div className="space-y-4">
        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Repair Cost
          </label>
          <input
            type="number"
            value={customRepair}
            onChange={(e) => setCustomRepair(Number(e.target.value))}
            placeholder="Enter repair cost"
            className="w-full px-3 py-2 rounded bg-[var(--s1)] border border-[var(--b2)]"
          />
        </div>

        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Transport Cost
          </label>
          <input
            type="number"
            value={customTransport}
            onChange={(e) => setCustomTransport(Number(e.target.value))}
            placeholder="Enter transport cost"
            className="w-full px-3 py-2 rounded bg-[var(--s1)] border border-[var(--b2)]"
          />
        </div>

        <div>
          <label className="text-sm text-[var(--t3)] mb-2 block">
            Target ROI (%)
          </label>
          <input
            type="number"
            value={targetROI * 100}
            onChange={(e) => setTargetROI(Number(e.target.value) / 100)}
            step="1"
            placeholder="Enter target ROI"
            className="w-full px-3 py-2 rounded bg-[var(--s1)] border border-[var(--b2)]"
          />
        </div>
      </div>

      {/* Recalculated max bid */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--s2)]">
        <div className="text-sm text-[var(--t3)] mb-1">Your Custom Max Bid</div>
        <div className="text-2xl font-bold">${maxBid.toLocaleString()}</div>
      </div>

      {/* Breakdown */}
      <div className="mt-4 text-xs text-[var(--t4)] space-y-1">
        <div>Sell estimate: ${deal.sellEstimate.toLocaleString()}</div>
        <div>Repair: -${customRepair.toLocaleString()}</div>
        <div>Transport: -${customTransport.toLocaleString()}</div>
        <div>
          Selling fees (9%): -$
          {Math.round(deal.sellEstimate * 0.09).toLocaleString()}
        </div>
        <div>Target ROI: {(targetROI * 100).toFixed(0)}%</div>
      </div>
    </div>
  );
}
