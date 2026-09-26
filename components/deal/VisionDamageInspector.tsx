"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, ShieldAlert, CheckCircle2, AlertTriangle, Sparkles, RefreshCw } from "lucide-react";
import { ShineBorder, BorderBeam } from "@/components/ui/premium-visuals";

export interface VisionFinding {
  id: string;
  category: "frame" | "airbag" | "paint" | "tires" | "panel";
  severity: "low" | "medium" | "high";
  title: string;
  description: string;
  confidence: number;
  location: string;
}

export function VisionDamageInspector({
  imageUrl,
  vin,
}: {
  imageUrl?: string;
  vin?: string;
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(true);
  const [selectedFinding, setSelectedFinding] = useState<VisionFinding | null>(null);

  const demoFindings: VisionFinding[] = [
    {
      id: "f1",
      category: "panel",
      severity: "medium",
      title: "Front Bumper & Hood Gap Misalignment",
      description: "Gemini 2.5 Vision detected 4.2mm uneven gap variance between left fender and hood — typical indicator of front-end collision repair.",
      confidence: 94,
      location: "Front Left Quarter Panel",
    },
    {
      id: "f2",
      category: "paint",
      severity: "low",
      title: "Clear Coat Over-spray Detected",
      description: "Specular reflection analysis shows minor clear coat orange-peel variance on passenger door panel.",
      confidence: 88,
      location: "Passenger Side Door",
    },
    {
      id: "f3",
      category: "frame",
      severity: "high",
      title: "Subframe Mounting Point Stress Crack",
      description: "Sub-surface shadow analysis indicates potential stress fractures near subframe mount — recommended manual lift inspection before bidding.",
      confidence: 91,
      location: "Underbody Front Subframe",
    },
  ];

  const handleReanalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
    }, 1500);
  };

  const sampleImage =
    imageUrl || "https://images.unsplash.com/photo-1555215695-3004980ad54e?auto=format&fit=crop&w=1200&q=80";

  return (
    <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[var(--amber)] to-[var(--purple)]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-black text-[var(--t1)]">Gemini 2.5 Vision AI Inspector</h3>
              <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[var(--amber-lo)] text-[var(--amber-d)] border border-[var(--amber-bd)]">
                Multi-Modal Neural Scan
              </span>
            </div>
            <p className="text-xs text-[var(--t4)]">
              Sub-pixel photo damage detection & alignment verification
            </p>
          </div>
        </div>

        <button
          onClick={handleReanalyze}
          disabled={analyzing}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold border border-[var(--b2)] bg-[var(--s1)] text-[var(--t2)] hover:text-[var(--t1)] hover:border-[var(--amber-bd)] transition-all disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${analyzing ? "animate-spin" : ""}`} />
          {analyzing ? "Scanning Photos..." : "Re-Scan Photos"}
        </button>
      </div>

      {/* Main Image Inspector viewport */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 relative rounded-2xl overflow-hidden border border-[var(--b2)] aspect-video bg-black flex items-center justify-center">
          <img
            src={sampleImage}
            alt="Vehicle Inspection Photo"
            className={`w-full h-full object-cover transition-opacity duration-500 ${
              analyzing ? "opacity-30" : "opacity-90"
            }`}
          />

          {analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="w-full h-1 bg-gradient-to-r from-transparent via-[var(--amber)] to-transparent animate-pulse" />
              <p className="text-sm font-mono font-bold text-white mt-4 bg-black/60 px-4 py-2 rounded-full backdrop-blur-md">
                Analyzing photo geometry & reflection vectors...
              </p>
            </div>
          )}

          {/* AI Finding Overlay Hotspots */}
          {!analyzing &&
            analyzed &&
            demoFindings.map((finding, i) => {
              const positions = [
                { top: "35%", left: "30%" },
                { top: "55%", left: "65%" },
                { top: "75%", left: "45%" },
              ];
              const pos = positions[i % positions.length];
              const isSelected = selectedFinding?.id === finding.id;

              return (
                <button
                  key={finding.id}
                  onClick={() => setSelectedFinding(finding)}
                  className="absolute z-20 group"
                  style={{ top: pos.top, left: pos.left }}
                >
                  <span
                    className={`relative flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold font-mono transition-transform hover:scale-125 ${
                      finding.severity === "high"
                        ? "bg-red-500/80 border-white text-white"
                        : finding.severity === "medium"
                        ? "bg-amber-500/80 border-white text-white"
                        : "bg-blue-500/80 border-white text-white"
                    } ${isSelected ? "ring-4 ring-white scale-125" : ""}`}
                  >
                    {i + 1}
                    <span className="absolute -inset-1 rounded-full animate-ping opacity-50 bg-current" />
                  </span>
                </button>
              );
            })}
        </div>

        {/* Findings List Sidebar */}
        <div className="lg:col-span-5 space-y-3">
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)] font-mono">
            Detected Visual Findings ({demoFindings.length})
          </span>

          {demoFindings.map((f, idx) => (
            <motion.div
              key={f.id}
              whileHover={{ scale: 1.02 }}
              onClick={() => setSelectedFinding(f)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                selectedFinding?.id === f.id
                  ? "border-[var(--amber-bd)] bg-[var(--amber-lo)]"
                  : "border-[var(--b2)] bg-[var(--s1)] hover:border-[var(--b3)]"
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-mono font-black flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      f.severity === "high"
                        ? "bg-red-500"
                        : f.severity === "medium"
                        ? "bg-amber-500"
                        : "bg-blue-500"
                    }`}
                  />
                  #{idx + 1} {f.title}
                </span>
                <span className="text-[10px] font-mono text-[var(--t4)]">
                  {f.confidence}% Confidence
                </span>
              </div>
              <p className="text-xs text-[var(--t3)] leading-relaxed line-clamp-2">{f.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
