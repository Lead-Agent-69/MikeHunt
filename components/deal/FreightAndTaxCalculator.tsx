"use client";

import React, { useState } from "react";
import { Truck, MapPin, Route } from "lucide-react";

export function FreightAndTaxCalculator({
  buyState = "TX",
  sellState = "CA",
  purchasePrice = 58500,
}: {
  buyState?: string;
  sellState?: string;
  purchasePrice?: number;
}) {
  const [carrierType, setCarrierType] = useState<"open" | "enclosed">("open");
  const [multiCarBundle, setMultiCarBundle] = useState(true);

  // Freight math
  const distanceMiles = 1380;
  const baseRatePerMile = carrierType === "open" ? 0.75 : 1.15;
  const rawFreight = distanceMiles * baseRatePerMile;
  const bundleDiscount = multiCarBundle ? 0.25 : 0; // 25% savings on multi-car haul
  const finalFreight = Math.round(rawFreight * (1 - bundleDiscount));

  // DMV & Tax Math (e.g. CA sales tax ~7.25% + $450 title/reg)
  const salesTaxRate =
    sellState === "CA" ? 0.0725 : sellState === "TX" ? 0.0625 : 0.06;
  const salesTax = Math.round(purchasePrice * salesTaxRate);
  const titleRegFee = 385;
  const totalLandedCost = purchasePrice + finalFreight + salesTax + titleRegFee;

  return (
    <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[#5b9bef] to-[var(--purple)]">
            <Truck className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[var(--t1)]">
              Transport & Tax Estimate
            </h3>
            <p className="text-xs text-[var(--t4)]">
              Local mileage and tax planning estimate. Confirm live quotes
              before bidding.
            </p>
          </div>
        </div>

        <span className="text-xs font-mono text-[var(--amber-d)] bg-[var(--amber-lo)] px-3 py-1 rounded-full border border-[var(--amber-bd)] font-bold">
          Estimate mode
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] space-y-4 font-mono text-xs">
            {/* Route preview */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-[var(--s0)] border border-[var(--b2)]">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[var(--amber)]" />
                <span className="font-bold text-[var(--t1)]">
                  {buyState} buy state
                </span>
              </div>
              <Route className="w-4 h-4 text-[var(--t4)]" />
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#00ff66]" />
                <span className="font-bold text-[var(--t1)]">
                  {sellState} sell state
                </span>
              </div>
            </div>

            {/* Carrier selector */}
            <div>
              <label className="text-[var(--t4)] block mb-1.5">
                Hauler Transport Type
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCarrierType("open")}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                    carrierType === "open"
                      ? "border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--amber-d)]"
                      : "border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)]"
                  }`}
                >
                  Open Auto Hauler
                </button>
                <button
                  type="button"
                  onClick={() => setCarrierType("enclosed")}
                  className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                    carrierType === "enclosed"
                      ? "border-[var(--purple-d)] bg-[var(--purple)]/20 text-white"
                      : "border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)]"
                  }`}
                >
                  Enclosed Carrier
                </button>
              </div>
            </div>

            {/* Multi-Car Bundle Checkbox */}
            <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--b2)] bg-[var(--s0)] cursor-pointer">
              <input
                type="checkbox"
                checked={multiCarBundle}
                onChange={(e) => setMultiCarBundle(e.target.checked)}
                className="w-4 h-4 accent-[var(--amber)]"
              />
              <div>
                <span className="font-bold text-[var(--t1)] block">
                  Multi-Car Trailer Bundle (-25%)
                </span>
                <span className="text-[10px] text-[var(--t4)]">
                  Use only when your hauler confirms a shared route
                </span>
              </div>
            </label>
          </div>
        </div>

        {/* Cost Breakdown Output */}
        <div className="lg:col-span-7 p-5 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] flex flex-col justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)] font-mono block mb-3">
              Estimated Landed Acquisition Cost
            </span>

            <div className="space-y-2.5 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-[var(--b2)] text-[var(--t3)]">
                <span>Vehicle Purchase Price:</span>
                <span className="font-bold text-[var(--t1)]">
                  ${purchasePrice.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--b2)] text-[var(--t3)]">
                <span>
                  Est. Shipping ({distanceMiles} mi @ $
                  {(finalFreight / distanceMiles).toFixed(2)}/mi):
                </span>
                <span className="font-bold text-[#00ff66]">
                  ${finalFreight.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--b2)] text-[var(--t3)]">
                <span>
                  {sellState} State Sales Tax ({(salesTaxRate * 100).toFixed(2)}
                  %):
                </span>
                <span className="font-bold text-[var(--t1)]">
                  ${salesTax.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[var(--b2)] text-[var(--t3)]">
                <span>DMV Title & Registration Fee:</span>
                <span className="font-bold text-[var(--t1)]">
                  ${titleRegFee.toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-[var(--b2)] flex items-center justify-between">
            <span className="text-xs font-mono font-bold text-[var(--t4)]">
              Total Landed Cost:
            </span>
            <span className="text-2xl font-black font-mono text-[var(--t1)]">
              ${totalLandedCost.toLocaleString()}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
