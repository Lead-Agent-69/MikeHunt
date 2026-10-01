"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mono } from "../shared/Mono";

interface LaneModeHUDProps {
  isOpen: boolean;
  onClose: () => void;
}

export function LaneModeHUD({ isOpen, onClose }: LaneModeHUDProps) {
  const [vin, setVin] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [message, setMessage] = useState("");

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        document.getElementById("lane-vin-input")?.focus();
      }, 500);
    } else {
      setVin("");
      setMessage("");
      setIsScanning(false);
    }
  }, [isOpen]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin || vin.length < 5) return;

    setIsScanning(true);
    setMessage("");

    try {
      const res = await fetch(`/api/vin/${encodeURIComponent(vin)}/specs`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("VIN lookup is unavailable");
      const data = await res.json();
      setMessage(
        data?.configured === false
          ? "VIN lookup is not configured yet. Connect the real VIN/history provider before using Lane Mode."
          : "VIN decoded. Live pricing, MMR, title history, and max-bid scoring still require connected market data.",
      );
    } catch {
      setMessage(
        "Lane Mode could not reach a real VIN/history service. No result was created because fake scan data is disabled.",
      );
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col bg-black text-white overflow-hidden"
          initial={{ opacity: 0, scaleY: 0.01 }}
          animate={{ opacity: 1, scaleY: 1 }}
          exit={{ opacity: 0, scaleY: 0.01 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }} // CRT turn on/off effect
        >
          {/* CRT scanline effect */}
          <div className="pointer-events-none absolute inset-0 z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20" />

          {/* HUD Header */}
          <header className="flex items-center justify-between p-4 border-b border-white/10 bg-black">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs font-black tracking-widest text-red-500 uppercase">
                Lane Mode Active
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </header>

          {/* Main Interface */}
          <div className="flex-1 flex flex-col p-4">
            {/* Input Area */}
            <form onSubmit={handleScan} className="relative mb-6">
              <input
                id="lane-vin-input"
                type="text"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase())}
                placeholder="ENTER VIN / SCAN"
                className="w-full bg-white/5 border border-white/20 rounded-xl px-4 py-5 text-2xl font-black font-mono text-cyan-400 placeholder:text-white/20 focus:outline-none focus:border-cyan-500 focus:bg-cyan-900/10 transition-all uppercase tracking-widest text-center"
                autoComplete="off"
              />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-cyan-500 text-black px-4 py-2 rounded-lg font-black text-xs tracking-wider"
              >
                GO
              </button>
            </form>

            {/* Scanning State */}
            {isScanning && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.5,
                    ease: "linear",
                  }}
                  className="w-16 h-16 rounded-full border-t-4 border-cyan-500 shadow-[0_0_30px_theme(colors.cyan.500)]"
                />
                <div className="text-cyan-500 font-mono text-sm uppercase tracking-widest animate-pulse">
                  Querying Database...
                </div>
              </div>
            )}

            {/* Real-service state */}
            {!isScanning && message && (
              <motion.div
                className="flex-1 flex items-center justify-center"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="max-w-sm rounded-xl border border-white/10 bg-white/5 p-5 text-center">
                  <div className="mb-2 text-xs font-black uppercase tracking-widest text-cyan-400">
                    Real lookup required
                  </div>
                  <p className="text-sm leading-relaxed text-white/70">
                    {message}
                  </p>
                </div>
              </motion.div>
            )}

            {/* Empty State */}
            {!isScanning && !message && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center opacity-30">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    className="mx-auto mb-4"
                  >
                    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                  </svg>
                  <div className="font-mono text-sm tracking-widest uppercase">
                    Ready for VIN
                  </div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
