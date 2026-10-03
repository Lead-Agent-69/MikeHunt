"use client";

import React, { useState } from "react";
import { ArrowLeftRight, Server, Copy, Check } from "lucide-react";

export function PeerToPeerExchangeAndMCP() {
  const [copied, setCopied] = useState(false);

  const mcpEndpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/mcp`
      : "https://mikehunt-69.vercel.app/api/mcp";

  const handleCopy = () => {
    navigator.clipboard.writeText(mcpEndpoint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const DEALER_WORKFLOWS = [
    {
      title: "Source-scoped search",
      detail:
        "Find vehicles by state, source, make/model, profit target, and buyer lane.",
      status: "Live inventory",
    },
    {
      title: "Proof-before-action",
      detail:
        "Return verdict, max bid, source proof, photo coverage, and deal math in one response.",
      status: "MCP ready",
    },
  ];

  return (
    <div className="space-y-6">
      {/* Dealer workflow surface */}
      <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[#00ff66] to-[var(--amber)]">
              <ArrowLeftRight className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-[var(--t1)]">
                Dealer Workflow Surface
              </h3>
              <p className="text-xs text-[var(--t4)]">
                Buyer-facing tools for sourced inventory, deal proof, and
                action-ready filtering
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--green)] bg-[var(--green)]/10 px-3 py-1 rounded-full border border-[var(--green)]/25">
            Real data only
          </span>
        </div>

        <div className="space-y-3">
          {DEALER_WORKFLOWS.map((item, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-mono text-xs hover:border-[var(--amber-bd)] transition-colors"
            >
              <div>
                <span className="font-bold text-sm text-[var(--t1)] block">
                  {item.title}
                </span>
                <span className="text-[var(--t4)] text-[11px]">
                  {item.detail}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="px-3 py-1.5 rounded-xl bg-[var(--s0)] border border-[var(--b2)] text-[var(--t2)] font-bold">
                  {item.status}
                </span>
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
              <h3 className="text-lg font-black text-[var(--t1)]">
                Model Context Protocol (MCP) Server
              </h3>
              <p className="text-xs text-[var(--t4)]">
                JSON-RPC endpoint for AI agents, Claude, Cursor, and custom LLM
                tools
              </p>
            </div>
          </div>
          <span className="text-xs font-mono font-bold text-[var(--purple-d)] bg-[var(--purple)]/20 px-3 py-1 rounded-full border border-[var(--purple-d)]">
            HTTP JSON-RPC
          </span>
        </div>

        <div className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] font-mono text-xs flex items-center justify-between">
          <span className="text-[var(--t2)] truncate mr-2">{mcpEndpoint}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors shrink-0"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-[#00ff66]" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span>{copied ? "Copied" : "Copy MCP URI"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
