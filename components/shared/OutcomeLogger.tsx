"use client";

import { useState } from "react";
import { Mono } from "./Mono";

interface OutcomeLoggerProps {
  dealId: string;
  dealInfo: {
    year?: number;
    make?: string;
    model?: string;
    vin?: string;
    askPrice: number;
    sellEstimate?: number;
    recommendedMaxBid?: number;
    repairEstimate?: number;
    transportEstimate?: number;
  };
  onSuccess?: () => void;
}

type Step = "purchase" | "costs" | "sale" | "review";

export function OutcomeLogger({
  dealId,
  dealInfo,
  onSuccess,
}: OutcomeLoggerProps) {
  const [step, setStep] = useState<Step>("purchase");
  const [saving, setSaving] = useState(false);

  // Form state
  const [purchased, setPurchased] = useState(true);
  const [purchasePrice, setPurchasePrice] = useState(dealInfo.askPrice || 0);
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [purchaseSource, setPurchaseSource] = useState<string>("auction");

  const [actualTransport, setActualTransport] = useState(
    dealInfo.transportEstimate || 0,
  );
  const [actualRecon, setActualRecon] = useState(dealInfo.repairEstimate || 0);
  const [actualFees, setActualFees] = useState(200);

  const [sold, setSold] = useState(false);
  const [sellPrice, setSellPrice] = useState(dealInfo.sellEstimate || 0);
  const [sellDate, setSellDate] = useState("");
  const [sellChannel, setSellChannel] = useState<string>("retail");

  // Calculated
  const allInCost = purchasePrice + actualTransport + actualRecon + actualFees;
  const profit = sold ? sellPrice - allInCost : 0;
  const roi = allInCost > 0 ? (profit / allInCost) * 100 : 0;
  const daysToSell =
    purchased && sold && purchaseDate && sellDate
      ? Math.floor(
          (new Date(sellDate).getTime() - new Date(purchaseDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 0;

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/dealer/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dealId,
          vin: dealInfo.vin,
          year: dealInfo.year,
          make: dealInfo.make,
          model: dealInfo.model,

          purchased,
          purchasePrice: purchased ? purchasePrice : null,
          purchaseDate: purchased ? purchaseDate : null,
          purchaseSource: purchased ? purchaseSource : null,

          actualTransport: purchased ? actualTransport : null,
          actualRecon: purchased ? actualRecon : null,
          actualFees: purchased ? actualFees : null,

          sold,
          sellPrice: sold ? sellPrice : null,
          sellDate: sold ? sellDate : null,
          sellChannel: sold ? sellChannel : null,

          platformEstSell: dealInfo.sellEstimate,
          platformEstTransport: dealInfo.transportEstimate,
          platformEstRecon: dealInfo.repairEstimate,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save outcome");
      }

      onSuccess?.();
    } catch (error) {
      console.error("Error saving outcome:", error);
      alert("Failed to save outcome. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const renderPurchaseStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-[var(--t1)] mb-4">
        Did you buy this vehicle?
      </h3>

      <div className="flex gap-3">
        <button
          onClick={() => setPurchased(true)}
          className={`flex-1 py-3 px-4 rounded-[var(--r2)] font-semibold transition-all ${
            purchased
              ? "bg-[var(--amber)] text-black"
              : "bg-[var(--s1)] text-[var(--t3)] border border-[var(--b2)]"
          }`}
        >
          ✓ Yes, I bought it
        </button>
        <button
          onClick={() => {
            setPurchased(false);
            setStep("review");
          }}
          className={`flex-1 py-3 px-4 rounded-[var(--r2)] font-semibold transition-all ${
            !purchased
              ? "bg-[var(--amber)] text-black"
              : "bg-[var(--s1)] text-[var(--t3)] border border-[var(--b2)]"
          }`}
        >
          ✗ No, I passed
        </button>
      </div>

      {purchased && (
        <>
          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              How much did you pay?
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono">
                $
              </span>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value))}
                className="w-full pl-7 pr-3 py-3 rounded-[var(--r2)] font-mono text-lg font-bold text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--b2)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              Purchase Date
            </label>
            <input
              type="date"
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
              className="w-full px-3 py-3 rounded-[var(--r2)] text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              Where did you buy it?
            </label>
            <select
              value={purchaseSource}
              onChange={(e) => setPurchaseSource(e.target.value)}
              className="w-full px-3 py-3 rounded-[var(--r2)] text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
            >
              <option value="auction">Auction</option>
              <option value="private">Private Party</option>
              <option value="wholesale">Wholesale</option>
              <option value="trade-in">Trade-in</option>
              <option value="dealer">Another Dealer</option>
            </select>
          </div>

          <button
            onClick={() => setStep("costs")}
            className="w-full py-3 rounded-[var(--r2)] font-bold text-black"
            style={{ background: "var(--grad)" }}
          >
            Next: Actual Costs →
          </button>
        </>
      )}
    </div>
  );

  const renderCostsStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-[var(--t1)] mb-4">
        What were your actual costs?
      </h3>

      <div>
        <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
          Transport Cost
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono">
            $
          </span>
          <input
            type="number"
            value={actualTransport}
            onChange={(e) => setActualTransport(Number(e.target.value))}
            className="w-full pl-7 pr-3 py-3 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>
        {dealInfo.transportEstimate && (
          <div className="text-xs text-[var(--t4)] mt-1">
            Platform estimated: ${dealInfo.transportEstimate.toLocaleString()}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
          Repair / Recon Cost
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono">
            $
          </span>
          <input
            type="number"
            value={actualRecon}
            onChange={(e) => setActualRecon(Number(e.target.value))}
            className="w-full pl-7 pr-3 py-3 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>
        {dealInfo.repairEstimate && (
          <div className="text-xs text-[var(--t4)] mt-1">
            Platform estimated: ${dealInfo.repairEstimate.toLocaleString()}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
          Fees (auction, doc, etc.)
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono">
            $
          </span>
          <input
            type="number"
            value={actualFees}
            onChange={(e) => setActualFees(Number(e.target.value))}
            className="w-full pl-7 pr-3 py-3 rounded-[var(--r2)] font-mono text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
            style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
          />
        </div>
      </div>

      <div
        className="p-4 rounded-[var(--r2)]"
        style={{ background: "var(--s2)" }}
      >
        <div className="text-sm text-[var(--t3)] mb-1">Total All-In Cost</div>
        <Mono className="text-2xl font-black text-[var(--t1)]">
          ${allInCost.toLocaleString()}
        </Mono>
      </div>

      <div className="flex gap-3">
        <button
          onClick={() => setStep("purchase")}
          className="flex-1 py-3 rounded-[var(--r2)] font-semibold border"
          style={{
            background: "var(--s1)",
            borderColor: "var(--b2)",
            color: "var(--t2)",
          }}
        >
          ← Back
        </button>
        <button
          onClick={() => setStep("sale")}
          className="flex-1 py-3 rounded-[var(--r2)] font-bold text-black"
          style={{ background: "var(--grad)" }}
        >
          Next: Sale Info →
        </button>
      </div>
    </div>
  );

  const renderSaleStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-[var(--t1)] mb-4">
        Have you sold it yet?
      </h3>

      <div className="flex gap-3">
        <button
          onClick={() => setSold(true)}
          className={`flex-1 py-3 px-4 rounded-[var(--r2)] font-semibold transition-all ${
            sold
              ? "bg-[var(--amber)] text-black"
              : "bg-[var(--s1)] text-[var(--t3)] border border-[var(--b2)]"
          }`}
        >
          ✓ Yes, sold
        </button>
        <button
          onClick={() => {
            setSold(false);
            setStep("review");
          }}
          className={`flex-1 py-3 px-4 rounded-[var(--r2)] font-semibold transition-all ${
            !sold
              ? "bg-[var(--amber)] text-black"
              : "bg-[var(--s1)] text-[var(--t3)] border border-[var(--b2)]"
          }`}
        >
          Not yet
        </button>
      </div>

      {sold && (
        <>
          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              Sell Price
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)] font-mono">
                $
              </span>
              <input
                type="number"
                value={sellPrice}
                onChange={(e) => setSellPrice(Number(e.target.value))}
                className="w-full pl-7 pr-3 py-3 rounded-[var(--r2)] font-mono text-lg font-bold text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
                style={{
                  background: "var(--s1)",
                  border: "1px solid var(--b2)",
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              Sell Date
            </label>
            <input
              type="date"
              value={sellDate}
              onChange={(e) => setSellDate(e.target.value)}
              className="w-full px-3 py-3 rounded-[var(--r2)] text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--t3)] mb-2 font-semibold">
              How did you sell it?
            </label>
            <select
              value={sellChannel}
              onChange={(e) => setSellChannel(e.target.value)}
              className="w-full px-3 py-3 rounded-[var(--r2)] text-[var(--t1)] outline-none transition-all focus:ring-2 focus:ring-[var(--amber)]"
              style={{ background: "var(--s1)", border: "1px solid var(--b2)" }}
            >
              <option value="retail">Retail (lot sale)</option>
              <option value="wholesale">Wholesale</option>
              <option value="auction">Auction</option>
              <option value="trade-in">Trade-in</option>
            </select>
          </div>
        </>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => setStep("costs")}
          className="flex-1 py-3 rounded-[var(--r2)] font-semibold border"
          style={{
            background: "var(--s1)",
            borderColor: "var(--b2)",
            color: "var(--t2)",
          }}
        >
          ← Back
        </button>
        <button
          onClick={() => setStep("review")}
          className="flex-1 py-3 rounded-[var(--r2)] font-bold text-black"
          style={{ background: "var(--grad)" }}
        >
          Review →
        </button>
      </div>
    </div>
  );

  const renderReviewStep = () => (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-[var(--t1)] mb-4">
        Review & Submit
      </h3>

      <div className="space-y-3">
        <div
          className="p-4 rounded-[var(--r2)]"
          style={{ background: "var(--s2)" }}
        >
          <div className="text-xs text-[var(--t4)] mb-2 uppercase tracking-wider font-semibold">
            Vehicle
          </div>
          <div className="text-[var(--t1)] font-bold">
            {dealInfo.year} {dealInfo.make} {dealInfo.model}
          </div>
        </div>

        {purchased ? (
          <>
            <div
              className="p-4 rounded-[var(--r2)]"
              style={{ background: "var(--s2)" }}
            >
              <div className="text-xs text-[var(--t4)] mb-2 uppercase tracking-wider font-semibold">
                Purchase
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--t3)]">Price:</span>
                <Mono className="text-[var(--t1)] font-bold">
                  ${purchasePrice.toLocaleString()}
                </Mono>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--t3)]">Date:</span>
                <span className="text-[var(--t2)]">{purchaseDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--t3)]">Source:</span>
                <span className="text-[var(--t2)] capitalize">
                  {purchaseSource}
                </span>
              </div>
            </div>

            <div
              className="p-4 rounded-[var(--r2)]"
              style={{ background: "var(--s2)" }}
            >
              <div className="text-xs text-[var(--t4)] mb-2 uppercase tracking-wider font-semibold">
                Costs
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--t3)]">Transport:</span>
                <Mono className="text-[var(--t1)]">
                  ${actualTransport.toLocaleString()}
                </Mono>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--t3)]">Recon:</span>
                <Mono className="text-[var(--t1)]">
                  ${actualRecon.toLocaleString()}
                </Mono>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-[var(--t3)]">Fees:</span>
                <Mono className="text-[var(--t1)]">
                  ${actualFees.toLocaleString()}
                </Mono>
              </div>
              <div
                className="flex justify-between pt-2 mt-2 border-t"
                style={{ borderColor: "var(--b2)" }}
              >
                <span className="text-[var(--t1)] font-bold">All-In:</span>
                <Mono className="text-[var(--t1)] font-black">
                  ${allInCost.toLocaleString()}
                </Mono>
              </div>
            </div>
          </>
        ) : (
          <div
            className="p-4 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <div className="text-[var(--t3)]">✗ Did not purchase</div>
          </div>
        )}

        {sold ? (
          <div
            className="p-4 rounded-[var(--r3)]"
            style={{
              background: profit >= 0 ? "var(--glo)" : "var(--rlo)",
              border: `2px solid ${profit >= 0 ? "var(--green)" : "var(--red)"}`,
            }}
          >
            <div
              className="text-xs mb-2 uppercase tracking-wider font-semibold"
              style={{ color: profit >= 0 ? "var(--green)" : "var(--red)" }}
            >
              Sale Result
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[var(--t3)]">Sell Price:</span>
              <Mono className="text-[var(--t1)] font-bold">
                ${sellPrice.toLocaleString()}
              </Mono>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[var(--t3)]">Date:</span>
              <span className="text-[var(--t2)]">{sellDate}</span>
            </div>
            <div className="flex justify-between mb-1">
              <span className="text-[var(--t3)]">Days to Sell:</span>
              <span className="text-[var(--t2)]">{daysToSell} days</span>
            </div>
            <div
              className="flex justify-between pt-2 mt-2 border-t"
              style={{
                borderColor: profit >= 0 ? "var(--green)" : "var(--red)",
              }}
            >
              <span
                className="font-bold"
                style={{ color: profit >= 0 ? "var(--green)" : "var(--red)" }}
              >
                Net Profit:
              </span>
              <Mono
                className="font-black text-xl"
                style={{ color: profit >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {profit >= 0 ? "+" : ""}${profit.toLocaleString()}
              </Mono>
            </div>
            <div className="flex justify-between">
              <span className="text-xs text-[var(--t4)]">ROI:</span>
              <Mono
                className="text-sm font-bold"
                style={{ color: profit >= 0 ? "var(--green)" : "var(--red)" }}
              >
                {roi >= 0 ? "+" : ""}
                {roi.toFixed(1)}%
              </Mono>
            </div>
          </div>
        ) : purchased ? (
          <div
            className="p-4 rounded-[var(--r2)]"
            style={{ background: "var(--s2)" }}
          >
            <div className="text-[var(--t3)]">Not sold yet</div>
          </div>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          onClick={() =>
            setStep(purchased ? (sold ? "sale" : "sale") : "purchase")
          }
          className="flex-1 py-3 rounded-[var(--r2)] font-semibold border"
          style={{
            background: "var(--s1)",
            borderColor: "var(--b2)",
            color: "var(--t2)",
          }}
        >
          ← Back
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-3 rounded-[var(--r2)] font-bold text-black disabled:opacity-50"
          style={{ background: "var(--grad)" }}
        >
          {saving ? "Saving..." : "Submit Outcome"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="glass-panel p-6 max-w-lg">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-6">
        {["purchase", "costs", "sale", "review"].map((s, i) => (
          <div
            key={s}
            className={`flex-1 h-1 rounded-full mx-1 transition-all ${
              ["purchase", "costs", "sale", "review"].indexOf(step) >= i
                ? "bg-[var(--amber)]"
                : "bg-[var(--b2)]"
            }`}
          />
        ))}
      </div>

      {step === "purchase" && renderPurchaseStep()}
      {step === "costs" && renderCostsStep()}
      {step === "sale" && renderSaleStep()}
      {step === "review" && renderReviewStep()}
    </div>
  );
}
