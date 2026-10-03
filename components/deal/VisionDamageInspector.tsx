"use client";

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  RefreshCw,
  Wrench,
  ChevronLeft,
  ChevronRight,
  Camera,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

export interface VisionFinding {
  id: string;
  imageIndex: number;
  category:
    | "frame"
    | "airbag"
    | "paint"
    | "tires"
    | "panel"
    | "glass"
    | "mechanical";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  confidence: number;
  location: string;
  estimatedCost: number;
  pin: { top: string; left: string };
}

export function VisionDamageInspector({
  imageUrl,
  images = [],
  vin,
  onUpdateRepairEstimate,
}: {
  imageUrl?: string;
  images?: string[];
  vin?: string;
  onUpdateRepairEstimate?: (cost: number) => void;
}) {
  const photoList = useMemo(() => {
    if (images && images.length > 0) return images;
    if (imageUrl) return [imageUrl];
    return [
      "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80",
    ];
  }, [imageUrl, images]);

  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [activeDefectIds, setActiveDefectIds] = useState<Set<string>>(
    new Set(["f1", "f2", "f3", "f4"]),
  );
  const [selectedFinding, setSelectedFinding] = useState<VisionFinding | null>(
    null,
  );

  const findingsList: VisionFinding[] = useMemo(
    () => [
      {
        id: "f1",
        imageIndex: 0,
        category: "panel",
        severity: "medium",
        title: "Front Bumper & Fender Gap Misalignment",
        description:
          "Photo review flags uneven spacing between the left fender and hood. Treat it as a front-end repair cue until verified in person.",
        confidence: 94,
        location: "Front Left Quarter Panel",
        estimatedCost: 350,
        pin: { top: "42%", left: "28%" },
      },
      {
        id: "f2",
        imageIndex: 0,
        category: "paint",
        severity: "low",
        title: "Clear Coat Over-spray & Orange Peel",
        description:
          "Visible finish texture looks inconsistent on the passenger door panel, which may indicate partial spot blending.",
        confidence: 88,
        location: "Passenger Side Door",
        estimatedCost: 450,
        pin: { top: "58%", left: "62%" },
      },
      {
        id: "f3",
        imageIndex: 0,
        category: "frame",
        severity: "high",
        title: "Subframe Mounting Stress Fracture",
        description:
          "Photo shadowing suggests a possible stress area near the subframe mount. Require rack inspection before placing a serious bid.",
        confidence: 91,
        location: "Underbody Front Subframe",
        estimatedCost: 1200,
        pin: { top: "72%", left: "46%" },
      },
      {
        id: "f4",
        imageIndex: Math.min(1, photoList.length - 1),
        category: "glass",
        severity: "low",
        title: "Bullseye Windshield Star Crack",
        description:
          "Small radial crack appears near the driver sight line. Budget resin fill or replacement for safety inspection.",
        confidence: 96,
        location: "Front Windshield Upper Driver Side",
        estimatedCost: 250,
        pin: { top: "30%", left: "48%" },
      },
      {
        id: "f5",
        imageIndex: Math.min(2, photoList.length - 1),
        category: "tires",
        severity: "medium",
        title: "Uneven Inner Shoulder Tread Wear",
        description:
          "Visible inner-shoulder tread wear on the front axle points to alignment and tire budget risk.",
        confidence: 89,
        location: "Front Left Wheel Assembly",
        estimatedCost: 400,
        pin: { top: "78%", left: "24%" },
      },
    ],
    [photoList.length],
  );

  const currentPhotoFindings = useMemo(() => {
    return findingsList.filter((f) => {
      const matchImage =
        f.imageIndex === activeImageIdx || photoList.length === 1;
      const matchCategory =
        selectedCategory === "all" || f.category === selectedCategory;
      return matchImage && matchCategory;
    });
  }, [findingsList, activeImageIdx, photoList.length, selectedCategory]);

  const totalReconEstimate = useMemo(() => {
    return findingsList
      .filter((f) => activeDefectIds.has(f.id))
      .reduce((sum, f) => sum + f.estimatedCost, 0);
  }, [findingsList, activeDefectIds]);

  function toggleDefect(id: string) {
    setActiveDefectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleReanalyze() {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
    }, 1400);
  }

  const categories = [
    { id: "all", label: "All Cues" },
    { id: "frame", label: "Frame / Structural" },
    { id: "panel", label: "Body Panels" },
    { id: "paint", label: "Paint & Finish" },
    { id: "glass", label: "Glass" },
    { id: "tires", label: "Tires & Wheels" },
  ];

  return (
    <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/90 backdrop-blur-2xl p-6 sm:p-7 shadow-2xl relative overflow-hidden interactive-surface">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-emerald-500 via-green-500 to-cyan-500 shadow-lg shadow-emerald-500/20">
            <Sparkles className="w-5 h-5 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-[var(--t1)]">
                Photo Recon Estimate
              </h3>
              <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Estimate mode
              </span>
            </div>
            <p className="text-xs text-[var(--t4)] font-medium mt-0.5">
              Visual checklist from listing photos. Confirm with inspection
              before bidding.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] uppercase font-bold text-[var(--t4)] block">
              Estimated Visual Recon
            </span>
            <Mono className="text-lg font-black text-amber-400">
              ${totalReconEstimate.toLocaleString()}
            </Mono>
          </div>

          <button
            onClick={handleReanalyze}
            disabled={analyzing}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold border border-[var(--b2)] bg-[var(--s1)] text-[var(--t2)] hover:text-white hover:border-emerald-500/40 transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${analyzing ? "animate-spin text-emerald-400" : ""}`}
            />
            {analyzing ? "Reviewing..." : "Re-check photos"}
          </button>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {categories.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedCategory(c.id)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === c.id
                ? "bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 shadow-sm"
                : "bg-[var(--s1)] border border-[var(--b2)] text-[var(--t3)] hover:text-[var(--t1)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* Main Visual Scan Viewport & Sidebar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Viewport with Overlays & Carousel */}
        <div className="lg:col-span-7 space-y-3">
          <div className="relative rounded-3xl overflow-hidden border border-[var(--b2)] aspect-video bg-black flex items-center justify-center shadow-inner group">
            <img
              src={photoList[activeImageIdx]}
              alt={`Vehicle Scan Angle ${activeImageIdx + 1}`}
              className={`w-full h-full object-cover transition-opacity duration-500 ${
                analyzing ? "opacity-30 scale-105" : "opacity-95"
              }`}
            />

            {/* Radar Sweep Line Animation */}
            {analyzing && (
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-between">
                <div className="w-full h-1 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_15px_#10b981] animate-pulse" />
                <div className="absolute inset-0 bg-emerald-500/5 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-mono font-black text-black bg-emerald-400 px-4 py-2 rounded-2xl shadow-xl shadow-emerald-500/30">
                    Reviewing visible photo cues...
                  </span>
                </div>
              </div>
            )}

            {/* AI Hotspot Pins */}
            {!analyzing &&
              currentPhotoFindings.map((finding) => {
                const isSelected = selectedFinding?.id === finding.id;
                const isIncluded = activeDefectIds.has(finding.id);

                return (
                  <button
                    key={finding.id}
                    onClick={() => setSelectedFinding(finding)}
                    className="absolute z-20 group/pin"
                    style={{ top: finding.pin.top, left: finding.pin.left }}
                  >
                    <span
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-black font-mono transition-all transform hover:scale-125 ${
                        finding.severity === "high"
                          ? "bg-red-500 border-white text-white shadow-lg shadow-red-500/50"
                          : finding.severity === "medium"
                            ? "bg-amber-500 border-white text-white shadow-lg shadow-amber-500/50"
                            : "bg-cyan-500 border-white text-white shadow-lg shadow-cyan-500/50"
                      } ${isSelected ? "ring-4 ring-emerald-400 scale-125" : ""} ${
                        !isIncluded ? "opacity-40 grayscale" : ""
                      }`}
                    >
                      !
                      <span className="absolute -inset-1 rounded-full animate-ping opacity-30 bg-current" />
                    </span>

                    {/* Hover Card */}
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/pin:block w-48 p-2.5 rounded-xl bg-black/90 backdrop-blur-md border border-white/10 text-left z-30 shadow-2xl pointer-events-none">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase">
                        {finding.category} • +${finding.estimatedCost}
                      </div>
                      <div className="text-xs font-black text-white leading-tight mt-0.5">
                        {finding.title}
                      </div>
                    </div>
                  </button>
                );
              })}

            {/* Photo Navigation Overlay Arrows */}
            {photoList.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setActiveImageIdx((prev) =>
                      prev > 0 ? prev - 1 : photoList.length - 1,
                    )
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-2xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-all opacity-80 hover:opacity-100"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button
                  onClick={() =>
                    setActiveImageIdx((prev) =>
                      prev < photoList.length - 1 ? prev + 1 : 0,
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-2xl bg-black/60 hover:bg-black/80 text-white backdrop-blur-md border border-white/10 transition-all opacity-80 hover:opacity-100"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </>
            )}

            {/* Bottom Status Ribbon */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono text-[var(--t3)]">
              <span className="flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-emerald-400" />
                Photo {activeImageIdx + 1} of {photoList.length}
              </span>
              <span>
                {currentPhotoFindings.length} Active Hotspots On Angle
              </span>
            </div>
          </div>

          {/* Photo Carousel Thumbnails */}
          {photoList.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {photoList.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImageIdx(idx)}
                  className={`relative rounded-xl overflow-hidden h-14 w-20 shrink-0 border-2 transition-all ${
                    activeImageIdx === idx
                      ? "border-emerald-400 shadow-md shadow-emerald-500/20 scale-105"
                      : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img}
                    alt={`Thumb ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Findings & Recon Ledger List */}
        <div className="lg:col-span-5 space-y-3 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[var(--t3)] font-mono">
                Photo Recon Findings ({findingsList.length})
              </span>
              <span className="text-[10px] font-bold text-emerald-400">
                Click box to toggle in recon total
              </span>
            </div>

            <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
              {findingsList.map((f, idx) => {
                const isSelected = selectedFinding?.id === f.id;
                const isIncluded = activeDefectIds.has(f.id);

                return (
                  <motion.div
                    key={f.id}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => {
                      setSelectedFinding(f);
                      if (
                        photoList.length > 1 &&
                        f.imageIndex < photoList.length
                      ) {
                        setActiveImageIdx(f.imageIndex);
                      }
                    }}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all ${
                      isSelected
                        ? "border-emerald-500/50 bg-emerald-500/10 shadow-lg shadow-emerald-500/5"
                        : "border-[var(--b2)] bg-[var(--s1)]/80 hover:border-emerald-500/30"
                    } ${!isIncluded ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={isIncluded}
                          onChange={(e) => {
                            e.stopPropagation();
                            toggleDefect(f.id);
                          }}
                          className="mt-1 rounded accent-emerald-500 h-4 w-4 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                f.severity === "high"
                                  ? "bg-red-500"
                                  : f.severity === "medium"
                                    ? "bg-amber-500"
                                    : "bg-cyan-500"
                              }`}
                            />
                            <h4 className="text-xs font-black text-[var(--t1)] leading-tight">
                              {f.title}
                            </h4>
                          </div>
                          <p className="text-[11px] text-[var(--t4)] mt-1 font-medium leading-relaxed">
                            {f.description}
                          </p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <Mono className="text-xs font-black text-amber-400">
                          +${f.estimatedCost}
                        </Mono>
                        <span className="text-[9px] font-mono text-[var(--t5)] block mt-0.5">
                          {f.confidence}% Conf
                        </span>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {/* Bottom Callout */}
          <div className="p-3.5 rounded-2xl bg-[var(--s2)] border border-[var(--b2)] flex items-center justify-between text-xs">
            <span className="flex items-center gap-2 text-[var(--t3)] font-semibold">
              <Wrench className="w-4 h-4 text-emerald-400" />
              Applied to Dealer Recon Budget
            </span>
            <Mono className="text-sm font-black text-emerald-400">
              ${totalReconEstimate.toLocaleString()}
            </Mono>
          </div>
        </div>
      </div>
    </div>
  );
}
