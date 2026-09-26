"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  ShieldCheck,
  Shield,
  AlertTriangle,
  FileSearch,
  CheckCircle,
  ExternalLink,
  MapPin,
  History,
  FileText,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface TitleWashData {
  vin: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  isWashedSuspect: boolean;
  auctionHistory: {
    hasAuctionRecord: boolean;
    auctionSource?: string;
    pastTitleBrand?: string;
    pastOdometer?: number;
    auctionDate?: string;
    damagesReported?: string[];
  };
  stateTransferGraph: Array<{
    state: string;
    date: string;
    event: string;
    isLoopholesState: boolean;
  }>;
  anomalies: string[];
  recommendation: string;
}

export function TitleWashDetector({
  vin,
  state,
}: {
  vin: string;
  state?: string;
}) {
  const [data, setData] = useState<TitleWashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [ranScan, setRanScan] = useState(false);

  async function runAudit() {
    if (!vin || vin.length !== 17) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/vin/title-wash?vin=${encodeURIComponent(vin)}${state ? `&state=${encodeURIComponent(state)}` : ""}`,
      );
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (e) {
      console.error("Title wash audit failed:", e);
    } finally {
      setLoading(false);
      setRanScan(true);
    }
  }

  // Auto-run if 17-char VIN
  useEffect(() => {
    if (vin && vin.length === 17 && !ranScan) {
      runAudit();
    }
  }, [vin]);

  if (!vin || vin.length !== 17) {
    return null;
  }

  const riskColor =
    data?.riskLevel === "high"
      ? "var(--red)"
      : data?.riskLevel === "medium"
        ? "var(--amber)"
        : "var(--green)";

  return (
    <div
      className="relative overflow-hidden rounded-3xl border border-[var(--b2)] bg-[var(--s0)]/80 backdrop-blur-2xl p-6 sm:p-7"
      style={{
        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
      }}
    >
      {/* Background glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-60 w-60 rounded-full opacity-15 blur-[70px]"
        style={{ background: riskColor }}
      />

      {/* Header */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-[var(--b1)]">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-2xl shadow-lg text-white"
            style={{
              background:
                data?.riskLevel === "high"
                  ? "linear-gradient(135deg, #EF4444, #991B1B)"
                  : data?.riskLevel === "medium"
                    ? "linear-gradient(135deg, #F59E0B, #B45309)"
                    : "linear-gradient(135deg, #10B981, #047857)",
            }}
          >
            {data?.riskLevel === "high" ? (
              <ShieldAlert className="h-5 w-5" />
            ) : data?.riskLevel === "medium" ? (
              <AlertTriangle className="h-5 w-5" />
            ) : (
              <ShieldCheck className="h-5 w-5" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--t4)]">
                NMVTIS Intelligence
              </span>
              {data && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border"
                  style={{
                    background: `${riskColor}15`,
                    color: riskColor,
                    borderColor: `${riskColor}30`,
                  }}
                >
                  {data.riskLevel} Risk ({data.riskScore}/100)
                </span>
              )}
            </div>
            <h3 className="text-xl font-black text-[var(--t1)] tracking-tight">
              Title Wash &amp; Salvage Scrub Detector
            </h3>
          </div>
        </div>

        <button
          onClick={runAudit}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-[var(--t2)] bg-[var(--s1)] border border-[var(--b2)] hover:border-[var(--b3)] hover:text-[var(--t1)] transition-all shrink-0"
        >
          <FileSearch className="h-3.5 w-3.5" />
          {loading ? "Analyzing Registries..." : "Re-Scan NMVTIS"}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-10 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
          <p className="mt-2 text-xs font-semibold text-[var(--t4)]">
            Auditing 50-state title transfers &amp; auction databases...
          </p>
        </div>
      ) : data ? (
        <div className="relative z-10 pt-5 space-y-5">
          {/* Risk Metric Bar */}
          <div>
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-[var(--t3)]">Title Wash Risk Index</span>
              <Mono style={{ color: riskColor }}>{data.riskScore}% Probability</Mono>
            </div>
            <div className="h-2 w-full bg-[var(--s2)] rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${data.riskScore}%` }}
                transition={{ duration: 0.8, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: riskColor }}
              />
            </div>
          </div>

          {/* Audit Findings & Recommendation */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left: Anomalies list */}
            <div className="lg:col-span-7 space-y-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--t4)]">
                Registry Checkpoint Findings
              </div>
              <div className="space-y-2">
                {data.anomalies.map((anom, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-2.5 p-3 rounded-2xl bg-[var(--s1)] border border-[var(--b1)] text-xs text-[var(--t2)] leading-relaxed"
                  >
                    {data.riskLevel === "high" ? (
                      <AlertTriangle className="h-4 w-4 text-[var(--red)] shrink-0 mt-0.5" />
                    ) : data.riskLevel === "medium" ? (
                      <AlertTriangle className="h-4 w-4 text-[var(--amber)] shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-4 w-4 text-[var(--green)] shrink-0 mt-0.5" />
                    )}
                    <span>{anom}</span>
                  </div>
                ))}
              </div>

              {/* State Transit Graph */}
              {data.stateTransferGraph.length > 0 && (
                <div className="pt-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)] mb-2 flex items-center gap-1.5">
                    <MapPin className="h-3 w-3" />
                    Interstate Movement Path
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {data.stateTransferGraph.map((st, idx) => (
                      <React.Fragment key={idx}>
                        <div
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border ${
                            st.isLoopholesState
                              ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              : "bg-[var(--s2)] text-[var(--t2)] border-[var(--b1)]"
                          }`}
                        >
                          <span>{st.state}</span>
                          {st.isLoopholesState && (
                            <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-300">
                              Corridor
                            </span>
                          )}
                        </div>
                        {idx < data.stateTransferGraph.length - 1 && (
                          <span className="text-[var(--t4)] text-xs">➔</span>
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right: Recommendation Card */}
            <div className="lg:col-span-5">
              <div
                className="p-5 rounded-3xl border text-xs leading-relaxed space-y-3"
                style={{
                  background: `${riskColor}08`,
                  borderColor: `${riskColor}30`,
                }}
              >
                <div className="flex items-center gap-2 font-black uppercase tracking-wider" style={{ color: riskColor }}>
                  <FileText className="h-4 w-4" />
                  Buyer Action Protocol
                </div>
                <p className="text-[var(--t2)] font-medium">
                  {data.recommendation}
                </p>

                {data.auctionHistory.hasAuctionRecord && (
                  <div className="p-3 rounded-2xl bg-black/40 border border-white/5 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
                      Auction Cross-Reference
                    </div>
                    <div className="font-mono text-[11px] text-[var(--t2)]">
                      Source: {data.auctionHistory.auctionSource} · Brand: {data.auctionHistory.pastTitleBrand}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
