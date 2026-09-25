"use client";

import { useState, useEffect } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Field } from "@/components/shared/Field";
import { Btn } from "@/components/shared/Btn";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { useDealerId } from "@/hooks/useDealerId";
import { fetcher } from "@/lib/swr-config";

import { Tag } from "@/components/shared/Tag";

const PARTS = [
  { name: "Engine (Complete)", value: 3800 },
  { name: "Transmission", value: 2400 },
  { name: "Doors (x4)", value: 1600 },
  { name: "Wheels/Tires (Set)", value: 1100 },
  { name: "Seats/Interior", value: 950 },
  { name: "Electronics/Modules", value: 1300 },
  { name: "Cat/Exhaust System", value: 1200 },
  { name: "Body Panels (Front/Rear)", value: 1400 },
  { name: "Headlights/Taillights", value: 850 },
  { name: "Suspension/Axles", value: 1150 },
];

const DAMAGE_TYPES = [
  { type: "Normal Wear", range: [0, 500] },
  { type: "Minor Dents/Scratches", range: [500, 1500] },
  { type: "Front End (Bumper/Grille)", range: [1500, 3500] },
  { type: "Rear End (Bumper/Trunk)", range: [1200, 3000] },
  { type: "Side/Door Damage", range: [1800, 4000] },
  { type: "Hail Damage", range: [2500, 6000] },
  { type: "Vandalism/Glass", range: [800, 2500] },
  { type: "Suspension/Undercarriage", range: [2000, 5000] },
  { type: "Mechanical (Engine)", range: [4000, 8000] },
  { type: "Mechanical (Transmission)", range: [3000, 6000] },
  { type: "Water/Flood (Fresh)", range: [5000, 10000] },
  { type: "Water/Flood (Salt)", range: [8000, 15000] },
  { type: "Fire (Engine)", range: [6000, 12000] },
  { type: "Fire (Interior)", range: [4000, 9000] },
  { type: "Frame Damage", range: [5000, 15000] },
  { type: "Biohazard", range: [1500, 4000] },
];

const PARTS_SOURCES = [
  { name: "LKQ Online", type: "Salvage/Recycled" },
  { name: "Car-Part.com", type: "Network" },
  { name: "RockAuto", type: "New Aftermarket" },
  { name: "eBay Motors", type: "Marketplace" },
  { name: "HollanderParts", type: "Network" },
  { name: "Copart (Donor Vehicles)", type: "Auction" },
  { name: "IAA (Donor Vehicles)", type: "Auction" },
  { name: "FCP Euro", type: "European OEM" },
  { name: "Pelican Parts", type: "European OEM" },
  { name: "PartsGeek", type: "Discount Aftermarket" },
  { name: "1A Auto", type: "Direct Aftermarket" },
  { name: "AutoZone Commercial", type: "Local/Same Day" },
  { name: "O'Reilly Auto Parts Pro", type: "Local/Same Day" },
  { name: "Advance Auto Parts Pro", type: "Local/Same Day" },
  { name: "NAPA Auto Parts", type: "Local/Same Day" },
  { name: "Keystone Automotive", type: "Collision/Body" },
  { name: "CertiFit", type: "Collision/Body" },
  { name: "Discount Tire Direct", type: "Tires/Wheels" },
  { name: "Tire Rack", type: "Tires/Wheels" },
  { name: "Crutchfield", type: "Electronics/Audio" },
  { name: "Summit Racing", type: "Performance/Custom" },
  { name: "JEGS", type: "Performance/Custom" },
  { name: "Steership Parts (Direct)", type: "OEM Dealership" },
  { name: "Pick-n-Pull", type: "U-Pull-It Salvage" },
  { name: "Row52", type: "U-Pull-It Network" },
];

export default function PartsPage() {
  const [activeTab, setActiveTab] = useState<"teardown" | "repair" | "sources">(
    "teardown",
  );
  const [selectedVehicle, setSelectedVehicle] = useState<string | null>(null);
  const [selectedParts, setSelectedParts] = useState<string[]>([
    "Engine (Complete)",
    "Transmission",
    "Wheels/Tires (Set)",
    "Cat/Exhaust System",
  ]);
  const [selectedDamage, setSelectedDamage] = useState<string>(
    DAMAGE_TYPES[0].type,
  );

  const { dealerId, loading: authLoading } = useDealerId();

  const {
    data: invData,
    error: invError,
    isLoading: invLoading,
  } = useSWR(
    dealerId && !authLoading
      ? `/api/inventory?dealerId=${dealerId}&limit=100`
      : null,
    fetcher,
  );
  const {
    data: partsData,
    error: partsError,
    isLoading: partsLoading,
    mutate: mutateEstimates,
  } = useSWR(dealerId && !authLoading ? "/api/parts" : null, fetcher);

  const inventory = ((invData?.items || []) as InventoryItem[]).filter((i) =>
    ["parts_only", "salvage_title"].includes(i.condition),
  );
  const savedEstimates =
    !partsError && Array.isArray(partsData) ? partsData : [];

  const loading = authLoading || invLoading || partsLoading;
  const error = dealerId
    ? invError?.message ||
      invData?.error ||
      partsError?.message ||
      partsData?.error ||
      null
    : "Not authenticated";

  useEffect(() => {
    if (inventory.length > 0 && !selectedVehicle) {
      setSelectedVehicle(inventory[0].id);
    }
  }, [inventory, selectedVehicle]);

  const vehicle = inventory.find((i) => i.id === selectedVehicle);
  const salvageCost = vehicle?.totalCost || 0;
  const partsValue = PARTS.filter((p) => selectedParts.includes(p.name)).reduce(
    (acc, p) => acc + p.value,
    0,
  );
  const net = partsValue - salvageCost;
  const roi = salvageCost > 0 ? (net / salvageCost) * 100 : 0;

  const togglePart = (name: string) => {
    setSelectedParts((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  };

  const saveTeardown = async () => {
    if (!vehicle) return;
    try {
      const res = await fetch("/api/parts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
          parts_list: selectedParts,
          total_estimate: partsValue,
        }),
      });

      if (!res.ok) throw new Error("Failed to save");
      const newEstimate = await res.json();
      mutateEstimates([newEstimate, ...savedEstimates], false);
      toast.success("Teardown estimate saved");
    } catch (e) {
      toast.error("Failed to save teardown estimate");
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 max-w-4xl mx-auto animate-fadeUp pb-24 md:pb-6">
      <div className="glass-panel p-4 md:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3 md:gap-4">
          <div
            className="w-10 h-10 md:w-12 md:h-12 rounded-xl flex items-center justify-center text-white"
            style={{ background: "var(--grad)" }}
          >
            <Ico name="settings" size={20} />
          </div>
          <div>
            <h1 className="text-lg md:text-2xl font-bold text-[var(--t1)]">
              Parts & Repair
            </h1>
            <p className="text-xs md:text-sm text-[var(--t4)] mt-0.5 md:mt-1">
              Teardown ROI, damage estimates, and parts sourcing.
            </p>
          </div>
        </div>
        <div
          className="flex items-center gap-2 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {[
            { id: "teardown", label: "Teardown ROI" },
            { id: "repair", label: "Repair Estimates" },
            { id: "sources", label: "Parts Directory" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`whitespace-nowrap px-4 py-2 rounded-lg text-sm font-bold transition-all border-none ${
                activeTab === tab.id
                  ? "text-white"
                  : "text-[var(--t4)] hover:text-[var(--t1)]"
              }`}
              style={
                activeTab === tab.id
                  ? { background: "var(--grad)" }
                  : { background: "var(--s0)", boxShadow: "var(--shadow2)" }
              }
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="glass-panel text-center py-20 flex flex-col items-center animate-pulse">
          <div className="w-12 h-12 rounded-full bg-[var(--amber)] opacity-20 animate-ping absolute"></div>
          <Ico
            name="refresh"
            className="text-[var(--coral)] animate-spin mb-4 relative z-10"
            size={32}
          />
          <p className="text-[var(--t3)] font-medium">
            Loading salvage inventory...
          </p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Couldn't load parts data"
          message={error}
          onRetry={() => window.location.reload()}
        />
      )}

      {!loading && !error && (
        <div className="space-y-4 md:space-y-6">
          {activeTab === "teardown" && (
            <>
              <div className="glass-panel p-4 md:p-6 animate-popIn">
                <h2 className="text-xs md:text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-3 md:mb-4">
                  1. Select Salvage Vehicle
                </h2>
                {inventory.length === 0 ? (
                  <p className="text-xs md:text-sm text-[var(--t3)] font-medium">
                    No salvage vehicles in inventory. Mark a vehicle as
                    parts_only or salvage_title in Fleet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {inventory.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelectedVehicle(item.id)}
                        className="w-full flex items-center justify-between p-3 md:p-4 rounded-xl transition-all text-left min-h-[56px] border-none"
                        style={
                          selectedVehicle === item.id
                            ? { background: "var(--amber-lo)" }
                            : {
                                background: "var(--s0)",
                                boxShadow: "var(--shadow2)",
                              }
                        }
                      >
                        <span className="text-sm font-bold text-[var(--t1)]">
                          {item.year} {item.make} {item.model}
                        </span>
                        <Mono className="text-sm font-bold text-[var(--amber)]">
                          ${item.totalCost.toLocaleString()}
                        </Mono>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div
                className="glass-panel p-4 md:p-6 animate-popIn"
                style={{ animationDelay: "100ms" }}
              >
                <h2 className="text-xs md:text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-3 md:mb-4">
                  2. Select Parts to Harvest
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 md:gap-3">
                  {PARTS.map((part) => (
                    <button
                      key={part.name}
                      onClick={() => togglePart(part.name)}
                      className="flex items-center justify-between p-3 md:p-4 rounded-xl transition-all text-left min-h-[56px] border-none"
                      style={
                        selectedParts.includes(part.name)
                          ? { background: "var(--amber-lo)" }
                          : {
                              background: "var(--s0)",
                              boxShadow: "var(--shadow2)",
                            }
                      }
                    >
                      <span className="text-sm font-bold text-[var(--t1)]">
                        {part.name}
                      </span>
                      <Mono className="text-sm font-bold text-[var(--t3)]">
                        ${part.value.toLocaleString()}
                      </Mono>
                    </button>
                  ))}
                </div>
              </div>

              <div
                className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 animate-popIn"
                style={{ animationDelay: "200ms" }}
              >
                <div className="glass-panel p-4 md:p-6 flex flex-col justify-center items-center group min-h-[100px]">
                  <p className="text-[10px] text-[var(--t4)] font-bold uppercase tracking-widest mb-2 group-hover:text-[var(--t2)] transition-colors">
                    Salvage Cost
                  </p>
                  <Mono className="text-3xl font-bold text-[var(--t1)]">
                    ${salvageCost.toLocaleString()}
                  </Mono>
                </div>
                <div className="glass-panel p-4 md:p-6 flex flex-col justify-center items-center group min-h-[100px]">
                  <p className="text-[10px] text-[var(--t4)] font-bold uppercase tracking-widest mb-2 group-hover:text-[var(--t2)] transition-colors">
                    Parts Value
                  </p>
                  <Mono className="text-3xl font-bold text-[var(--t1)]">
                    ${partsValue.toLocaleString()}
                  </Mono>
                </div>
                <div
                  className="glass-panel p-4 md:p-6 flex flex-col justify-center items-center"
                  style={{ background: net >= 0 ? "var(--glo)" : "var(--rlo)" }}
                >
                  <p
                    className="text-[10px] font-bold uppercase tracking-widest mb-2"
                    style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    Net / ROI
                  </p>
                  <Mono
                    className="text-3xl font-bold"
                    style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {net >= 0 ? "+" : "-"}${Math.abs(net).toLocaleString()}
                  </Mono>
                  <span
                    className="text-sm font-bold mt-1"
                    style={{ color: net >= 0 ? "var(--green)" : "var(--red)" }}
                  >
                    {roi.toFixed(0)}% ROI
                  </span>
                </div>
              </div>

              <button
                disabled={!vehicle || selectedParts.length === 0}
                onClick={saveTeardown}
                className="w-full text-sm font-bold text-white disabled:opacity-50 py-3 md:py-3.5 rounded-xl transition-all border-none min-h-[48px]"
                style={{ background: "var(--grad)" }}
              >
                Save Teardown Estimate
              </button>

              {savedEstimates.length > 0 && (
                <div className="glass-panel p-4 md:p-6 mt-8 animate-popIn">
                  <h2 className="text-xs md:text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-3 md:mb-4">
                    Saved Estimates
                  </h2>
                  <div className="space-y-3">
                    {savedEstimates.map((est: any) => (
                      <div
                        key={est.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-[var(--b1)] bg-[var(--s2)]"
                      >
                        <div>
                          <span className="text-sm font-bold text-[var(--t1)] block">
                            {est.vehicle_name}
                          </span>
                          <span className="text-[10px] text-[var(--t3)] uppercase tracking-widest">
                            {new Date(est.created_at).toLocaleDateString()}
                          </span>
                          <div className="flex gap-1 mt-2 flex-wrap">
                            {est.parts_list
                              .slice(0, 3)
                              .map((p: string, i: number) => (
                                <Tag key={i}>{p}</Tag>
                              ))}
                            {est.parts_list.length > 3 && (
                              <Tag>+{est.parts_list.length - 3} more</Tag>
                            )}
                          </div>
                        </div>
                        <Mono className="text-lg font-black text-[var(--t1)] mt-3 sm:mt-0">
                          ${est.total_estimate.toLocaleString()}
                        </Mono>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {activeTab === "repair" && (
            <div className="glass-panel p-4 md:p-6 animate-popIn">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-black text-[var(--t1)]">
                    Damage Type Estimator
                  </h2>
                  <p className="text-sm text-[var(--t3)]">
                    Standard 2025 repair cost ranges based on 16 damage
                    profiles.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[var(--s3)] flex items-center justify-center border border-[var(--b1)]">
                  <Ico name="wrench" size={20} className="text-[var(--t3)]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DAMAGE_TYPES.map((d) => (
                  <button
                    key={d.type}
                    onClick={() => setSelectedDamage(d.type)}
                    className="flex items-center justify-between p-4 rounded-xl transition-all text-left border-none"
                    style={
                      selectedDamage === d.type
                        ? { background: "var(--alo)" }
                        : {
                            background: "var(--s0)",
                            boxShadow: "var(--shadow2)",
                          }
                    }
                  >
                    <span className="text-sm font-bold text-[var(--t1)]">
                      {d.type}
                    </span>
                    <Mono className="text-sm font-bold text-[var(--amber)]">
                      ${d.range[0].toLocaleString()} - $
                      {d.range[1].toLocaleString()}
                    </Mono>
                  </button>
                ))}
              </div>
            </div>
          )}

          {activeTab === "sources" && (
            <div className="glass-panel p-4 md:p-6 animate-popIn">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-black text-[var(--t1)]">
                    25 Preferred Parts Sources
                  </h2>
                  <p className="text-sm text-[var(--t3)]">
                    Recommended suppliers for arbitrage and recon projects.
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[var(--s3)] flex items-center justify-center border border-[var(--b1)]">
                  <Ico name="search" size={20} className="text-[var(--t3)]" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {PARTS_SOURCES.map((source, i) => (
                  <div
                    key={i}
                    className="p-4 rounded-xl border border-[var(--b1)] bg-[var(--s2)] flex flex-col justify-center h-20 hover:border-[var(--amber)] hover:bg-[rgba(236,72,153,.05)] transition-colors"
                  >
                    <span className="text-sm font-bold text-[var(--t1)] mb-1">
                      {source.name}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--t4)]">
                      {source.type}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
