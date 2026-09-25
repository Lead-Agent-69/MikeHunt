"use client";

import React, { useState, useEffect, useRef } from "react";
import { Ico } from "@/components/shared/Ico";
import { createClientComponentClient } from "@/lib/supabase";
import { scanVINFromCamera } from "@/lib/api/vin";
import { isValidVin, normalizeVin } from "@/lib/vehicle/vin";
import { toast } from "sonner";
import Link from "next/link";

export default function LaneModePage() {
  const supabase = createClientComponentClient();
  const [listId, setListId] = useState<string | null>(null);
  const [runListName, setRunListName] = useState<string>("All Vehicles");
  const [deals, setDeals] = useState<any[]>([]);
  const [filteredDeals, setFilteredDeals] = useState<any[]>([]);
  const [activeDeal, setActiveDeal] = useState<any | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [offlineMode, setOfflineMode] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Read URL search params
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const listIdParam = params.get("listId");
      const vinParam = params.get("vin");
      setListId(listIdParam);

      if (vinParam) {
        setSearchQuery(normalizeVin(vinParam));
      }
    }
  }, []);

  // Monitor network status
  useEffect(() => {
    setOfflineMode(!navigator.onLine);

    const goOnline = () => setOfflineMode(false);
    const goOffline = () => setOfflineMode(true);

    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Load data based on listId and online/offline status
  useEffect(() => {
    loadData();
  }, [listId, offlineMode]);

  async function loadData() {
    if (offlineMode) {
      // Load from local storage
      const cacheKey = listId
        ? `offline-runlist-${listId}`
        : "offline-runlist-all";
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        setDeals(parsed);
        if (parsed.length > 0) setActiveDeal(parsed[0]);
      } else {
        toast.error("Offline: No cached data found for this run list.");
      }
      return;
    }

    // Online Mode
    try {
      if (listId) {
        const { data: runList } = await supabase
          .from("auction_run_lists")
          .select("*")
          .eq("id", listId)
          .single();

        if (runList) {
          setRunListName(runList.auction_name);
          const { data: listDeals } = await supabase
            .from("deals")
            .select("*")
            .in("vin", runList.vins);

          if (listDeals) {
            setDeals(listDeals);
            if (listDeals.length > 0) setActiveDeal(listDeals[0]);
            // Update cache
            localStorage.setItem(
              `offline-runlist-${listId}`,
              JSON.stringify(listDeals),
            );
          }
        }
      } else {
        // Load all active deals that might be from run lists
        const { data: allDeals } = await supabase
          .from("deals")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(100);

        if (allDeals) {
          setDeals(allDeals);
          if (allDeals.length > 0) setActiveDeal(allDeals[0]);
          localStorage.setItem("offline-runlist-all", JSON.stringify(allDeals));
        }
      }
    } catch (err) {
      console.error("Error loading lane data:", err);
    }
  }

  // Filter deals list based on search query (Make, Model, or VIN)
  useEffect(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      setFilteredDeals(deals);
      return;
    }

    const filtered = deals.filter(
      (deal) =>
        deal.vin?.toLowerCase().includes(query) ||
        deal.make?.toLowerCase().includes(query) ||
        deal.model?.toLowerCase().includes(query),
    );
    setFilteredDeals(filtered);

    // If query matches a single deal perfectly, set it active
    if (filtered.length === 1) {
      setActiveDeal(filtered[0]);
    }
  }, [searchQuery, deals]);

  // Start Camera scan
  async function startScan() {
    setIsScanning(true);
    setScanLoading(true);

    try {
      // Prompt user/browser for camera permission
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", focusMode: "continuous" } as any,
      });
      setStream(mediaStream);
      setScanLoading(false);

      // Give React a tick to mount the video element
      setTimeout(async () => {
        const videoEl = document.getElementById(
          "video-preview",
        ) as HTMLVideoElement;
        if (videoEl) {
          videoEl.srcObject = mediaStream;
          await videoEl.play().catch(() => {});
        }

        // Launch standard camera parser loop
        const scannedVin = await scanVINFromCamera();
        if (scannedVin) {
          const cleanVin = normalizeVin(scannedVin);
          setSearchQuery(cleanVin);
          toast.success(`Scanned VIN: ${cleanVin}`);
          stopScan();
        }
      }, 100);
    } catch (err) {
      console.error("Camera startup failed:", err);
      toast.error("Could not access camera");
      stopScan();
    }
  }

  function stopScan() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsScanning(false);
    setScanLoading(false);
  }

  // Format currency
  const fmt = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val || 0);

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:flex-row overflow-hidden bg-[var(--s0)]">
      {/* Sidebar: Vehicles List */}
      <div className="w-full md:w-80 flex flex-col border-r border-[var(--b2)] bg-[var(--s1)] shrink-0 h-1/2 md:h-full">
        {/* Header Area */}
        <div className="p-4 border-b border-[var(--b2)] space-y-3">
          <div className="flex items-center justify-between">
            <h1 className="text-base font-black text-[var(--t1)] truncate max-w-[180px]">
              {runListName}
            </h1>
            <span
              className="text-[10px] px-2 py-0.5 rounded-[var(--r3)] font-bold flex items-center gap-1 uppercase tracking-wider"
              style={{
                background: offlineMode
                  ? "rgba(231,76,60,0.15)"
                  : "rgba(46,204,113,0.15)",
                color: offlineMode ? "var(--red)" : "var(--green)",
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: offlineMode ? "var(--red)" : "var(--green)",
                }}
              />
              {offlineMode ? "Offline" : "Lane Sync"}
            </span>
          </div>

          {/* Search/Filter Bar */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--t4)]">
                <Ico name="search" size={16} />
              </span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Make, Model, VIN..."
                className="w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] pl-9 pr-3 py-1.5 text-xs text-[var(--t1)] outline-none focus:border-[var(--amber)]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--t4)] hover:text-[var(--t2)]"
                >
                  <Ico name="x" size={14} />
                </button>
              )}
            </div>
            <button
              onClick={startScan}
              className="p-2 rounded-[var(--r2)] text-white hover:scale-105 active:scale-95 transition-transform flex items-center justify-center shrink-0"
              style={{ background: "var(--amber)" }}
              title="Scan VIN Barcode"
            >
              <Ico name="camera" size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable Vehicle List */}
        <div className="flex-1 overflow-y-auto divide-y divide-[var(--b3)]">
          {filteredDeals.length === 0 ? (
            <div className="text-center py-12 text-[var(--t3)] text-xs">
              No matching vehicles found.
            </div>
          ) : (
            filteredDeals.map((deal) => {
              const isActive = activeDeal?.id === deal.id;
              const isGo = deal.deal_verdict === "go";

              return (
                <div
                  key={deal.id}
                  onClick={() => setActiveDeal(deal)}
                  className={`p-3.5 cursor-pointer transition-colors relative flex items-center justify-between gap-3 ${
                    isActive
                      ? "bg-[var(--s2)] border-l-2 border-[var(--amber)]"
                      : "hover:bg-[var(--s2)]"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-black text-[var(--t1)] flex items-center gap-1.5">
                      <span>
                        {deal.year} {deal.make} {deal.model}
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--t3)] font-mono truncate mt-0.5">
                      {deal.vin}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-black text-[var(--t1)]">
                      {fmt(deal.recommended_max_bid)}
                    </div>
                    <div
                      className="text-[9px] font-bold uppercase tracking-wider mt-0.5"
                      style={{ color: isGo ? "var(--green)" : "var(--t3)" }}
                    >
                      {isGo ? "GO" : "HOLD"}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Main Panel: Vehicle Inspection */}
      <div className="flex-1 overflow-y-auto p-6 bg-[var(--s0)] h-1/2 md:h-full">
        {activeDeal ? (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Header / Verdict Card */}
            <div className="glass-panel p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-2xl font-black text-[var(--t1)]">
                  {activeDeal.year} {activeDeal.make} {activeDeal.model}
                </h2>
                <div className="text-sm font-mono text-[var(--t3)] mt-1 flex items-center gap-2">
                  <span>VIN: {activeDeal.vin}</span>
                  <span>·</span>
                  <span className="capitalize">
                    {activeDeal.condition?.replace("_", " ")}
                  </span>
                </div>
              </div>

              <div
                className="px-5 py-3 rounded-[var(--r3)] text-center w-full md:w-auto"
                style={{
                  background:
                    activeDeal.deal_verdict === "go"
                      ? "rgba(46,204,113,0.12)"
                      : "rgba(255,255,255,0.05)",
                  border: `1px solid ${
                    activeDeal.deal_verdict === "go"
                      ? "rgba(46,204,113,0.25)"
                      : "var(--b2)"
                  }`,
                }}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t3)]">
                  VERDICT
                </div>
                <div
                  className="text-xl font-black uppercase tracking-wider"
                  style={{
                    color:
                      activeDeal.deal_verdict === "go"
                        ? "var(--green)"
                        : "var(--t3)",
                  }}
                >
                  {activeDeal.deal_verdict === "go" ? "GO VERDICT" : "HOLD"}
                </div>
              </div>
            </div>

            {/* Lane Valuation Matrix */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Max Bid Card */}
              <div className="glass-panel p-6 flex flex-col justify-between relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-4 -translate-y-4 w-24 h-24 rounded-full bg-[rgba(241,196,15,0.03)] border border-[rgba(241,196,15,0.05)]" />
                <div>
                  <div className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
                    <Ico
                      name="calculator"
                      size={14}
                      className="text-[var(--amber)]"
                    />
                    Recommended Max Bid
                  </div>
                  <div className="text-4xl font-black text-[var(--amber)] tracking-tight">
                    {fmt(activeDeal.recommended_max_bid)}
                  </div>
                  <p className="text-xs text-[var(--t3)] mt-2 leading-relaxed">
                    This is your absolute ceiling bid at the block to maintain
                    your target ROI. Overbidding reduces profit.
                  </p>
                </div>
                <div className="border-t border-[var(--b3)] pt-3 mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] text-[var(--t3)] uppercase tracking-wider">
                      Resale Target
                    </div>
                    <div className="text-sm font-bold text-[var(--t1)]">
                      {fmt(activeDeal.sell_estimate)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-[var(--t3)] uppercase tracking-wider">
                      Est. Profit
                    </div>
                    <div className="text-sm font-bold text-[var(--green)]">
                      {fmt(activeDeal.true_net_profit)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estimate Cost Breakdown */}
              <div className="glass-panel p-6">
                <h3 className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider mb-4 flex items-center gap-1.5">
                  <Ico name="wrench" size={14} className="text-[var(--t3)]" />
                  Cost Adjustments
                </h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between items-center text-[var(--t2)]">
                    <span>Acquisition Fees</span>
                    <span className="font-mono text-xs">
                      {fmt(
                        (activeDeal.deal_analysis?.costs?.acquisition || 0) -
                          activeDeal.recommended_max_bid,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[var(--t2)]">
                    <span>Recon & Repairs</span>
                    <span className="font-mono text-xs">
                      {fmt(activeDeal.estimated_repair_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[var(--t2)]">
                    <span>Transport Cost</span>
                    <span className="font-mono text-xs">
                      {fmt(activeDeal.estimated_transport_cost)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-[var(--t2)]">
                    <span>Holding & Carrying</span>
                    <span className="font-mono text-xs">
                      {fmt(activeDeal.deal_analysis?.costs?.holding)}
                    </span>
                  </div>
                  <div className="border-t border-[var(--b3)] pt-2.5 flex justify-between items-center font-bold text-[var(--t1)]">
                    <span>Total Adjustments</span>
                    <span className="font-mono">
                      {fmt(
                        activeDeal.deal_analysis?.costs?.total -
                          activeDeal.recommended_max_bid,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparable Units (Comps) */}
            <div className="glass-panel p-6">
              <h3 className="text-sm font-black text-[var(--t1)] mb-4 flex items-center gap-2">
                <Ico
                  name="trending-up"
                  size={18}
                  className="text-[var(--amber)]"
                />
                Live Sold Comps / MMR Basis
              </h3>

              {activeDeal.deal_analysis?.valuation?.comparableSales &&
              activeDeal.deal_analysis.valuation.comparableSales.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-[var(--b2)] text-[var(--t3)] uppercase font-semibold">
                        <th className="pb-2">Year Make Model</th>
                        <th className="pb-2">Price</th>
                        <th className="pb-2">Mileage</th>
                        <th className="pb-2">Source</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--b3)] text-[var(--t2)]">
                      {activeDeal.deal_analysis.valuation.comparableSales.map(
                        (comp: any, idx: number) => (
                          <tr
                            key={idx}
                            className="hover:bg-[rgba(255,255,255,0.02)]"
                          >
                            <td className="py-2.5">
                              {comp.year} {comp.make} {comp.model}
                            </td>
                            <td className="py-2.5 font-bold text-[var(--t1)]">
                              {fmt(comp.price || comp.ask_price)}
                            </td>
                            <td className="py-2.5">
                              {comp.mileage
                                ? `${comp.mileage.toLocaleString()} mi`
                                : "—"}
                            </td>
                            <td className="py-2.5 uppercase text-[10px] tracking-wider text-[var(--t3)]">
                              {comp.source}
                            </td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-6 text-[var(--t3)] text-xs border border-dashed border-[var(--b2)] rounded-[var(--r2)]">
                  No comps found for {activeDeal.year} {activeDeal.make}{" "}
                  {activeDeal.model} in this region.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center text-[var(--t3)]">
            <Ico name="car" size={48} className="text-[var(--t4)] mb-4" />
            <h3 className="text-lg font-bold text-[var(--t1)]">
              No Vehicle Selected
            </h3>
            <p className="text-sm max-w-sm mt-1">
              Select a vehicle from the list or scan a VIN to begin inspecting.
            </p>
          </div>
        )}
      </div>

      {/* Camera Scan Overlay Modal */}
      {isScanning && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-md bg-[var(--s1)] rounded-[var(--r3)] border border-[var(--b2)] overflow-hidden shadow-2xl relative">
            <button
              onClick={stopScan}
              className="absolute right-4 top-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors z-10"
            >
              <Ico name="x" size={20} />
            </button>

            <div className="p-6">
              <h3 className="text-lg font-black text-white mb-2 flex items-center gap-2">
                <Ico name="camera" className="text-[var(--amber)]" />
                Scan VIN Barcode
              </h3>
              <p className="text-xs text-[var(--t3)] mb-4">
                Align the VIN barcode inside the camera view finder to scan.
              </p>

              <div className="relative aspect-[4/3] bg-black rounded-lg overflow-hidden border border-[var(--b2)]">
                {scanLoading ? (
                  <div className="absolute inset-0 flex items-center justify-center text-white text-xs gap-2">
                    <Ico
                      name="refresh"
                      className="animate-spin text-[var(--amber)]"
                    />
                    Starting Camera...
                  </div>
                ) : (
                  <video
                    id="video-preview"
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                  />
                )}
                {/* Aim grid finder */}
                <div className="absolute inset-x-6 top-1/2 -translate-y-1/2 h-10 border-2 border-[var(--amber)] rounded-md opacity-60 pointer-events-none" />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
