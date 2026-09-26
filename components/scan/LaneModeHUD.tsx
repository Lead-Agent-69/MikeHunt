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
  const [mockResult, setMockResult] = useState<any>(null);

  // Focus input automatically when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        document.getElementById("lane-vin-input")?.focus();
      }, 500);
    } else {
      setVin("");
      setMockResult(null);
      setIsScanning(false);
    }
  }, [isOpen]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vin || vin.length < 5) return;
    
    setIsScanning(true);
    // Simulate ultra-fast API lookup (since this is Lane Mode)
    setTimeout(() => {
      setIsScanning(false);
      setMockResult({
        year: 2021,
        make: "Toyota",
        model: "Camry SE",
        mmr: 18500,
        sellEst: 22000,
        maxBid: 19100,
        verdict: "go",
        history: "Clean / 1 Owner",
      });
    }, 600);
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
              <span className="text-xs font-black tracking-widest text-red-500 uppercase">Lane Mode Active</span>
            </div>
            <button 
              onClick={onClose}
              className="p-2 rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
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
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="w-16 h-16 rounded-full border-t-4 border-cyan-500 shadow-[0_0_30px_theme(colors.cyan.500)]"
                />
                <div className="text-cyan-500 font-mono text-sm uppercase tracking-widest animate-pulse">
                  Querying Database...
                </div>
              </div>
            )}

            {/* Results State (Dense Data Grid) */}
            {!isScanning && mockResult && (
              <motion.div 
                className="flex-1 flex flex-col gap-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                {/* Hero Stats */}
                <div className="bg-white/5 rounded-xl border border-white/10 p-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold">{mockResult.year} {mockResult.make}</h2>
                    <div className="text-white/50 text-sm">{mockResult.model} • {mockResult.history}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs uppercase tracking-widest text-green-400 font-black">Verdict</div>
                    <div className="text-3xl font-black text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.4)]">
                      {mockResult.verdict.toUpperCase()}
                    </div>
                  </div>
                </div>

                {/* Grid Stats */}
                <div className="grid grid-cols-2 gap-3 flex-1">
                  <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Market Value</div>
                    <Mono className="text-2xl font-bold text-white">${mockResult.sellEst.toLocaleString()}</Mono>
                  </div>
                  
                  <div className="bg-white/5 rounded-xl p-4 flex flex-col justify-between">
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Current MMR</div>
                    <Mono className="text-2xl font-bold text-white/80">${mockResult.mmr.toLocaleString()}</Mono>
                  </div>

                  <div className="col-span-2 bg-gradient-to-r from-cyan-900/40 to-blue-900/40 border border-cyan-500/30 rounded-xl p-5 flex items-center justify-between shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold mb-1">Max Bid (20% ROI)</div>
                      <Mono className="text-4xl font-black text-cyan-400">
                        ${mockResult.maxBid.toLocaleString()}
                      </Mono>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-cyan-500/20 flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-cyan-400">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="grid grid-cols-2 gap-3 mt-auto pb-4">
                  <button className="bg-white/10 hover:bg-white/20 text-white font-bold py-4 rounded-xl transition-colors">
                    Pass
                  </button>
                  <button className="bg-cyan-500 hover:bg-cyan-400 text-black font-black py-4 rounded-xl transition-colors shadow-[0_0_15px_theme(colors.cyan.500)]">
                    Save Deal
                  </button>
                </div>
              </motion.div>
            )}

            {/* Empty State */}
            {!isScanning && !mockResult && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center opacity-30">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" className="mx-auto mb-4">
                    <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                  </svg>
                  <div className="font-mono text-sm tracking-widest uppercase">Ready for VIN</div>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
