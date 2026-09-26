"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight, Server, ShieldCheck, Zap, Copy, Check } from "lucide-react";

export function PeerToPeerExchangeAndMCP() {
  const [copied, setCopied] = useState(false);

  const mcpEndpoint = "https://mikehunt.ai/api/mcp/v1/valuation";

  const handleCopy = () => {
    navigator.clipboard.writeText(mcpEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const DEALER_TRADES = [
    { title: "2021 Porsche 911 Carrera S", dealer: "Apex Exotic Autos (Dallas, TX)", price: "$114,000", feeSaved: "$3,420 Saved vs Auction", status: "Available Direct" },
    { title: "2022 Chevrolet Corvette Stingray 3LT", dealer: "Lone Star Motors (Austin, TX)", price: "$68,500", feeSaved: "$2,055 Saved vs Auction", status: "Available Direct" },
  ];

  return (
    <div className="space-y-6">
      {/* Off-market P2P Dealer Exchange */}
      <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[#00ff66] to-[var(--amber)]">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--t1)]">Off-Market B2B Dealer Exchange</h3>
              <p className="text-xs text-[var(--t4)]">
                Peer-to-peer dealer inventory trades — Zero auction buy/sell fee
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[#00ff66] bg-[#00ff66]/15 px-3 py-1 rounded-full border border-[#00ff66]/30">
            0% Auction Fee Guarantee
          </span>
        </div>

        <div className="space-y-3">
          {DEALER_TRADES.map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs hover:border-[var(--amber-bd)] transition-colors"
            >
              <div>
                <span className="font-bold text-sm text-[var(--t1)] block">{item.title}</span>
                <span className="text-[var(--t4)] text-[11px]">{item.dealer}</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <span className="text-sm font-black text-[var(--t1)] block">{item.price}</span>
                  <span className="text-[10px] text-[#00ff66] font-bold">{item.feeSaved}</span>
                </div>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-[var(--grad)] text-white font-bold text-xs shadow-md"
                >
                  Initiate Trade →
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Model Context Protocol (MCP) Server Integration */}
      <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[var(--purple)] to-[#5b9bef]">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--t1)]">Model Context Protocol (MCP) Server</h3>
              <p className="text-xs text-[var(--t4)]">
                Programmatic API endpoint for AI agents, Claude, & custom LLM tools
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--purple-d)] bg-[var(--purple)]/20 px-3 py-1 rounded-full border border-[var(--purple-d)]">
            MCP Spec v1.0
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] font-mono text-xs flex items-center justify-between">
          <span className="text-[var(--t2)] truncate mr-2">{mcpEndpoint}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#00ff66]" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? "Copied" : "Copy MCP URI"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
