"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidGlassButton } from "@/components/ui/framer-components";
import { ArrowRight, Bot, Calculator, Send, X } from "lucide-react";

type SourceHealthSummary = {
  configured?: boolean;
  total?: number;
  enabled?: number;
  healthy?: number;
  sources?: Array<{
    id: string;
    name: string;
    readiness?: string;
    activeRows?: number;
    rowsWithPhotos?: number;
    averageQuality?: number;
    lastStatus?: string;
    lastSeenAt?: string | null;
    requiresAuth?: boolean;
  }>;
};

type SystemStatusSummary = {
  readiness?: {
    counts?: {
      ready?: number;
      partial?: number;
      missing?: number;
    };
    items?: Array<{
      label: string;
      status: string;
      userImpact?: string;
      detail?: string;
    }>;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. MIKEHUNT DEAL COPILOT DRAWER — Conversational Readiness Assistant
// ─────────────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: string;
  dealSuggestion?: {
    title: string;
    profit: string;
    score: number;
    vin: string;
  };
}

export function MikeHuntCopilotDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [sourceHealth, setSourceHealth] = useState<SourceHealthSummary | null>(
    null,
  );
  const [systemStatus, setSystemStatus] = useState<SystemStatusSummary | null>(
    null,
  );
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "ai",
      text: "Deal Copilot can read live readiness, source health, and inventory proof now. Deterministic deal and market reads work today; provider-generated AI upgrades when a key is connected.",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const openCopilot = () => setIsOpen(true);
    window.addEventListener("open-mikehunt-copilot", openCopilot);
    return () =>
      window.removeEventListener("open-mikehunt-copilot", openCopilot);
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadReadiness() {
      try {
        const [healthRes, statusRes] = await Promise.all([
          fetch("/api/scrape/health"),
          fetch("/api/system/status"),
        ]);
        const [healthJson, statusJson] = await Promise.all([
          healthRes.ok ? healthRes.json() : null,
          statusRes.ok ? statusRes.json() : null,
        ]);
        if (!alive) return;
        setSourceHealth(healthJson);
        setSystemStatus(statusJson);
      } catch {
        if (!alive) return;
        setSourceHealth(null);
        setSystemStatus(null);
      }
    }
    loadReadiness();
    const interval = window.setInterval(loadReadiness, 60000);
    return () => {
      alive = false;
      window.clearInterval(interval);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen, isTyping]);

  const QUICK_PROMPTS = [
    "What data sources are connected?",
    "Why is inventory empty?",
    "What do I need to enable AI?",
    "What should I fix next?",
    "How should salvage titles be verified?",
  ];
  const aiProviderReady = Boolean(
    systemStatus?.readiness?.items?.find((item) => item.label === "AI provider")
      ?.status === "ready",
  );
  const supabaseReady = Boolean(
    systemStatus?.readiness?.items?.find(
      (item) => item.label === "Supabase data API",
    )?.status === "ready",
  );
  const visibleRows =
    sourceHealth?.sources?.reduce(
      (sum, source) => sum + (source.activeRows || 0),
      0,
    ) || 0;
  const readySourceCount =
    sourceHealth?.sources?.filter((source) => source.readiness === "ready")
      .length || 0;
  const launcherLabel = aiProviderReady
    ? "AI connected"
    : supabaseReady || visibleRows > 0
      ? "Inventory live · briefs ready"
      : "AI setup needed";
  const headerStatus = aiProviderReady
    ? "Provider connected"
    : supabaseReady || visibleRows > 0
      ? `${visibleRows.toLocaleString()} live rows · ${readySourceCount} ready sources · deterministic briefs`
      : "Provider not connected";

  const handleSend = (userText: string) => {
    if (!userText.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userText,
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const lower = userText.toLowerCase();
      const sources = sourceHealth?.sources || [];
      const readySources = sources.filter((s) => s.readiness === "ready");
      const authSources = sources.filter((s) => s.readiness === "needs_login");
      const noRowSources = sources.filter((s) => s.readiness === "no_rows");
      const totalRows = sources.reduce(
        (sum, s) => sum + (s.activeRows || 0),
        0,
      );
      const totalPhotos = sources.reduce(
        (sum, s) => sum + (s.rowsWithPhotos || 0),
        0,
      );
      const missingReadiness =
        systemStatus?.readiness?.items
          ?.filter((item) => item.status === "missing")
          .map((item) => item.label)
          .slice(0, 4) || [];
      const partialReadiness =
        systemStatus?.readiness?.items
          ?.filter((item) => item.status === "partial")
          .map((item) => item.label)
          .slice(0, 4) || [];

      let responseText =
        "I can answer from this app's live readiness checks and deterministic deal logic now. Connect an AI provider key to upgrade the same evidence into generated co-pilot answers.";

      if (
        lower.includes("source") ||
        lower.includes("connected") ||
        lower.includes("working")
      ) {
        responseText = readySources.length
          ? `Ready sources right now: ${readySources
              .map(
                (s) =>
                  `${s.name} (${s.activeRows || 0} rows, ${
                    s.rowsWithPhotos || 0
                  } with photos, ${s.averageQuality || 0}% quality)`,
              )
              .join("; ")}. Needs login: ${authSources.length}. No rows: ${
              noRowSources.length
            }. Total visible rows from public proof: ${totalRows}, with ${totalPhotos} photo-backed rows.`
          : "No source has proven ready rows yet. Open Sources to see whether each one needs login, scraper setup, or a fresh run.";
      } else if (
        lower.includes("empty") ||
        lower.includes("inventory") ||
        lower.includes("data")
      ) {
        responseText = sourceHealth?.configured
          ? `Inventory is connected, but source proof currently shows ${totalRows} active rows from ${readySources.length} ready sources. If a search looks empty, narrow less or run the matching sources.`
          : `The app is in public preview mode because Supabase is not connected in this environment. It can show public source proof (${totalRows} rows, ${totalPhotos} photo-backed), but saved inventory and user-specific imports need real Supabase keys.`;
      } else if (
        lower.includes("ai") ||
        lower.includes("enable") ||
        lower.includes("key")
      ) {
        responseText = `Inventory and source-health checks are ${sourceHealth?.configured || totalRows > 0 ? "live" : "not fully connected"}; deterministic briefs are available from saved deal math; provider-generated AI is ${aiProviderReady ? "connected" : "offline"}. To enable the full copilot, connect an approved AI provider key on the server and keep import controls protected. Missing now: ${
          missingReadiness.length
            ? missingReadiness.join(", ")
            : "none reported"
        }. Partial: ${
          partialReadiness.length
            ? partialReadiness.join(", ")
            : "none reported"
        }.`;
      } else if (
        lower.includes("next") ||
        lower.includes("fix") ||
        lower.includes("upgrade")
      ) {
        responseText = `Best next fixes: finish account sync, raise VIN/mileage/contact coverage, connect provider AI for richer generated answers, then add credentials or approved access handling for gated auction sources. Product-wise, keep the user flow tight: pick vehicle, state, title, budget, lane; run only matching sources; show quality and source proof on every result.`;
      } else if (
        lower.includes("salvage") ||
        lower.includes("title") ||
        lower.includes("rebuilt")
      ) {
        responseText =
          "Title guidance can be shown without fabricating a deal: verify salvage/rebuilt status through the state title record, NMVTIS-style history, seller disclosure, frame/airbag inspection, and post-repair receipts. The app should discount branded-title vehicles only after real comps and inspection data are available.";
      }

      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: "ai",
        text: responseText,
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 400);
  };

  return (
    <>
      {/* Floating Launcher Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(true)}
        aria-label="Open deal readiness copilot"
        className="fixed right-4 top-20 z-40 hidden max-w-[calc(100vw-24px)] items-center gap-3 rounded-full border px-4 py-3 text-sm font-bold shadow-2xl md:flex lg:right-6 lg:top-auto lg:bottom-6 lg:z-50 lg:px-5 lg:py-3.5"
        style={{
          background: "var(--s0)",
          color: "var(--t1)",
          borderColor: "var(--b2)",
          boxShadow: "var(--shadow)",
        }}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--amber-lo)] text-[11px] font-black text-[var(--amber-d)]">
          <Bot className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="hidden truncate md:inline">{launcherLabel}</span>
        <span className="sr-only">{launcherLabel}</span>
      </motion.button>

      {/* Drawer overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[70] flex justify-end pb-[env(safe-area-inset-bottom)]">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-md"
            />

            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative z-10 flex h-[calc(100%-env(safe-area-inset-bottom))] w-full max-w-md flex-col border-l border-[var(--b2)] bg-[var(--s0)] shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-[var(--r4)] sm:border"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--b2)] bg-[var(--s1)]/80 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold"
                    style={{ background: "var(--grad)" }}
                  >
                    <Bot className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--t1)]">
                      Deal Readiness Copilot
                    </h3>
                    <p className="text-xs text-[var(--t4)]">{headerStatus}</p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full border border-[var(--b2)] grid place-items-center text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                  aria-label="Close deal copilot"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 font-sans text-sm">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`flex flex-col ${m.sender === "user" ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-[85%] p-3.5 rounded-2xl ${
                        m.sender === "user"
                          ? "bg-[var(--purple)] text-white rounded-br-none"
                          : "bg-[var(--s1)] border border-[var(--b2)] text-[var(--t1)] rounded-bl-none"
                      }`}
                    >
                      <p className="leading-relaxed whitespace-pre-wrap">
                        {m.text}
                      </p>

                      {m.dealSuggestion && (
                        <div className="mt-3 p-3 rounded-xl border border-[var(--amber-bd)] bg-[var(--amber-lo)] text-[var(--t1)]">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-xs font-bold text-[var(--amber-d)] font-mono">
                              IQ {m.dealSuggestion.score}
                            </span>
                            <span className="text-xs font-black text-[#00ff66]">
                              {m.dealSuggestion.profit}
                            </span>
                          </div>
                          <p className="font-bold text-sm">
                            {m.dealSuggestion.title}
                          </p>
                          <p className="text-[11px] text-[var(--t4)] font-mono">
                            VIN: {m.dealSuggestion.vin}
                          </p>
                        </div>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--t5)] mt-1 px-1">
                      {m.timestamp}
                    </span>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex items-center gap-2 p-3.5 rounded-2xl bg-[var(--s1)] border border-[var(--b2)] text-[var(--t4)] w-fit">
                    <span className="w-2 h-2 rounded-full bg-[var(--amber)] animate-bounce" />
                    <span className="w-2 h-2 rounded-full bg-[var(--purple)] animate-bounce [animation-delay:0.2s]" />
                    <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-bounce [animation-delay:0.4s]" />
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts Pill Strip */}
              <div className="p-3 border-t border-[var(--b2)] bg-[var(--s1)]/40 overflow-x-auto flex gap-2 no-scrollbar">
                {QUICK_PROMPTS.map((qp, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(qp)}
                    className="shrink-0 text-xs px-3 py-1.5 rounded-full border border-[var(--b2)] bg-[var(--s0)] text-[var(--t3)] hover:text-[var(--t1)] hover:border-[var(--amber-bd)] transition-all whitespace-nowrap"
                  >
                    {qp}
                  </button>
                ))}
              </div>

              {/* Input Bar */}
              <div className="border-t border-[var(--b2)] bg-[var(--s1)] p-3 pb-[calc(12px+env(safe-area-inset-bottom))] sm:p-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSend(input);
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about sources, setup, or deal proof..."
                    className="min-w-0 flex-1 rounded-xl border border-[var(--b2)] bg-[var(--s0)] px-3 py-2.5 text-sm text-[var(--t1)] placeholder:text-[var(--t5)] focus:border-[var(--amber)] focus:outline-none sm:px-4"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-bold text-white sm:px-4"
                    style={{ background: "var(--grad)" }}
                  >
                    <Send className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">Send</span>
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. PROFIT SIMULATOR & MARGIN LAB DRAWER
// ─────────────────────────────────────────────────────────────────────────────

export function ProfitSimulatorDrawer({
  isOpen,
  onClose,
  initialPrice = 25000,
  initialRetail = 32000,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialPrice?: number;
  initialRetail?: number;
}) {
  const [purchasePrice, setPurchasePrice] = useState(initialPrice);
  const [buyerFee, setBuyerFee] = useState(650);
  const [transportCost, setTransportCost] = useState(850);
  const [reconBudget, setReconBudget] = useState(1200);
  const [targetRetail, setTargetRetail] = useState(initialRetail);
  const [holdDays, setHoldDays] = useState(21);

  const totalCost =
    purchasePrice + buyerFee + transportCost + reconBudget + holdDays * 15;
  const netProfit = targetRetail - totalCost;
  const roi = ((netProfit / totalCost) * 100).toFixed(1);
  const marginPct = ((netProfit / targetRetail) * 100).toFixed(1);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md"
      />

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="relative w-full max-w-xl bg-[var(--s0)] border border-[var(--b2)] rounded-3xl p-6 shadow-2xl z-10 overflow-hidden"
      >
        <div className="flex items-center justify-between border-b border-[var(--b2)] pb-4 mb-6">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--amber-lo)] text-[var(--amber-d)]">
              <Calculator className="h-[18px] w-[18px]" aria-hidden="true" />
            </span>
            <div>
              <h3 className="text-xl font-black text-[var(--t1)]">
                Profit Simulator Lab
              </h3>
              <p className="text-xs text-[var(--t4)]">
                Interactive Deal Math & Margin Stress Test
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full border border-[var(--b2)] grid place-items-center text-[var(--t4)] hover:text-[var(--t1)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Live Net Profit Display Card */}
        <div
          className="p-6 rounded-2xl mb-6 flex items-center justify-between border border-white/10"
          style={{
            background:
              netProfit >= 0
                ? "linear-gradient(135deg, rgba(0,255,102,0.15), rgba(0,200,80,0.05))"
                : "linear-gradient(135deg, rgba(255,50,50,0.15), rgba(200,0,0,0.05))",
          }}
        >
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--t4)]">
              Estimated Net Profit
            </span>
            <div
              className={`text-4xl font-black font-mono mt-1 ${
                netProfit >= 0 ? "text-[#00ff66]" : "text-red-400"
              }`}
            >
              {netProfit >= 0
                ? `+$${netProfit.toLocaleString()}`
                : `-$${Math.abs(netProfit).toLocaleString()}`}
            </div>
          </div>

          <div className="text-right font-mono">
            <div className="text-sm text-[var(--t3)]">
              ROI: <span className="font-bold text-[var(--t1)]">{roi}%</span>
            </div>
            <div className="text-sm text-[var(--t3)]">
              Margin:{" "}
              <span className="font-bold text-[var(--t1)]">{marginPct}%</span>
            </div>
          </div>
        </div>

        {/* Sliders Grid */}
        <div className="space-y-4 text-xs font-bold">
          <div>
            <div className="flex justify-between text-[var(--t2)] mb-1">
              <span>Auction / Buy Price:</span>
              <span className="font-mono text-sm text-[var(--t1)]">
                ${purchasePrice.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={2000}
              max={100000}
              step={500}
              value={purchasePrice}
              onChange={(e) => setPurchasePrice(Number(e.target.value))}
              className="w-full accent-[var(--amber)]"
            />
          </div>

          <div>
            <div className="flex justify-between text-[var(--t2)] mb-1">
              <span>Target Retail Price:</span>
              <span className="font-mono text-sm text-[var(--t1)]">
                ${targetRetail.toLocaleString()}
              </span>
            </div>
            <input
              type="range"
              min={5000}
              max={120000}
              step={500}
              value={targetRetail}
              onChange={(e) => setTargetRetail(Number(e.target.value))}
              className="w-full accent-[var(--purple)]"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <div>
              <label className="text-[var(--t4)] block mb-1">
                Buyer / Auction Fee ($)
              </label>
              <input
                type="number"
                value={buyerFee}
                onChange={(e) => setBuyerFee(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-sm font-mono text-[var(--t1)]"
              />
            </div>

            <div>
              <label className="text-[var(--t4)] block mb-1">
                Transport / Shipping ($)
              </label>
              <input
                type="number"
                value={transportCost}
                onChange={(e) => setTransportCost(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-sm font-mono text-[var(--t1)]"
              />
            </div>

            <div>
              <label className="text-[var(--t4)] block mb-1">
                Recon / Repair Budget ($)
              </label>
              <input
                type="number"
                value={reconBudget}
                onChange={(e) => setReconBudget(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-sm font-mono text-[var(--t1)]"
              />
            </div>

            <div>
              <label className="text-[var(--t4)] block mb-1">
                Est. Hold Time (Days)
              </label>
              <input
                type="number"
                value={holdDays}
                onChange={(e) => setHoldDays(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s1)] text-sm font-mono text-[var(--t1)]"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-[var(--b2)] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl font-bold text-white text-sm"
            style={{ background: "var(--grad)" }}
          >
            Apply Deal Parameters
            <ArrowRight className="ml-2 inline h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. GEO-ARBITRAGE RADAR COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function ArbitrageRadar() {
  const [spreads, setSpreads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/arbitrage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const rows = [
          ...(data?.regionalArbitrage || []),
          ...(data?.nationalArbitrage || []),
        ].slice(0, 3);
        setSpreads(rows);
      })
      .catch(() => {
        if (!cancelled) setSpreads([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && spreads.length === 0) return null;

  return (
    <div className="p-6 rounded-3xl border border-[var(--b2)] bg-[var(--s0)] relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-[var(--amber-d)] bg-[var(--amber-lo)] px-2.5 py-1 rounded-full">
            Cross-State Arbitrage Radar
          </span>
          <h3 className="text-xl font-black text-[var(--t1)] mt-2">
            Regional Spread Opportunities
          </h3>
        </div>
        <span className="text-sm font-mono text-[var(--green)]">
          {loading ? "Loading" : "Live data"}
        </span>
      </div>

      <div className="space-y-3">
        {(loading ? Array.from({ length: 3 }) : spreads).map((s: any, i) => {
          const arb = s?.arbitrage?.arbitrage || {};
          const from =
            s?.arbitrage?.sourceState || s?.deal?.locationState || "Source";
          const to = s?.arbitrage?.targetRegion?.state || "Target";
          const vehicle = s?.deal
            ? `${s.deal.year || ""} ${s.deal.make || ""} ${s.deal.model || ""}`.trim()
            : "Loading opportunity";
          const buyPrice = s?.deal?.askPrice;
          const sellPrice = arb?.targetMarketPrice;
          const netSpread = arb?.potentialProfit;
          return (
            <div
              key={i}
              className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-[var(--amber-bd)] transition-colors"
            >
              <div>
                <span className="text-xs font-bold text-[var(--t4)] font-mono">
                  {vehicle}
                </span>
                <div className="flex items-center gap-2 text-sm font-bold text-[var(--t1)] mt-0.5">
                  <span>{from}</span>
                  <span className="text-[var(--amber)]">➔</span>
                  <span>{to}</span>
                </div>
              </div>

              <div className="flex items-center gap-6 font-mono text-xs">
                <div>
                  <span className="text-[var(--t4)] block">Buy Comp</span>
                  <span className="text-[var(--t1)] font-bold text-sm">
                    {buyPrice ? `$${Number(buyPrice).toLocaleString()}` : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--t4)] block">Sell Retail</span>
                  <span className="text-[var(--t1)] font-bold text-sm">
                    {sellPrice ? `$${Number(sellPrice).toLocaleString()}` : "-"}
                  </span>
                </div>
                <div>
                  <span className="text-[var(--t4)] block">Arbitrage</span>
                  <span className="text-[var(--green)] font-black text-sm">
                    {netSpread
                      ? `+$${Number(netSpread).toLocaleString()}`
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
