"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LiquidGlassButton } from "@/components/ui/framer-components";

// ─────────────────────────────────────────────────────────────────────────────
// 1. MIKEHUNT AI DEAL COPILOT DRAWER — Conversational Intelligence Assistant
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
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      sender: "ai",
      text: "MikeHunt AI is installed in the interface, but the live AI provider and inventory feed are not connected in this environment yet. Once OpenAI and Supabase are configured, I can answer from real market data.",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    "How should salvage titles be verified?",
  ];

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
      const responseText =
        lower.includes("salvage") ||
        lower.includes("title") ||
        lower.includes("rebuilt")
          ? "Title guidance can be shown without fabricating a deal: verify salvage/rebuilt status through the state title record, NMVTIS-style history, seller disclosure, frame/airbag inspection, and post-repair receipts. The app should discount branded-title vehicles only after real comps and inspection data are available."
          : "I cannot answer from live market data yet because this environment does not have a configured AI provider or populated Supabase inventory. Connect the real keys/data pipeline first, then this drawer should call the backend AI endpoint instead of using canned responses.";

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
        className="fixed bottom-[calc(72px+env(safe-area-inset-bottom))] right-3 z-40 flex max-w-[calc(100vw-24px)] items-center gap-2 rounded-full border px-3.5 py-2.5 text-xs font-bold shadow-2xl md:bottom-6 md:right-6 md:z-50 md:gap-3 md:px-5 md:py-3.5 md:text-sm"
        style={{
          background: "var(--s0)",
          color: "var(--t1)",
          borderColor: "var(--b2)",
          boxShadow: "var(--shadow)",
        }}
      >
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--amber)]" />
        <span className="truncate">AI not connected</span>
      </motion.button>

      {/* Drawer overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[70] flex justify-end">
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
              className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-[var(--b2)] bg-[var(--s0)] shadow-2xl sm:m-3 sm:h-[calc(100%-24px)] sm:rounded-[var(--r4)] sm:border"
            >
              {/* Drawer Header */}
              <div className="flex items-center justify-between p-5 border-b border-[var(--b2)] bg-[var(--s1)]/80 backdrop-blur-xl">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl grid place-items-center text-white font-bold"
                    style={{ background: "var(--grad)" }}
                  >
                    AI
                  </div>
                  <div>
                    <h3 className="text-base font-black text-[var(--t1)]">
                      MikeHunt AI Co-pilot
                    </h3>
                    <p className="text-xs text-[var(--t4)]">
                      Provider not connected
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setIsOpen(false)}
                  className="w-8 h-8 rounded-full border border-[var(--b2)] grid place-items-center text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
                >
                  ✕
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
                    placeholder="Ask MikeHunt AI anything..."
                    className="min-w-0 flex-1 rounded-xl border border-[var(--b2)] bg-[var(--s0)] px-3 py-2.5 text-sm text-[var(--t1)] placeholder-[var(--t5)] focus:border-[var(--amber)] focus:outline-none sm:px-4"
                  />
                  <button
                    type="submit"
                    className="shrink-0 rounded-xl px-3 py-2.5 text-sm font-bold text-white sm:px-4"
                    style={{ background: "var(--grad)" }}
                  >
                    Send
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
            <span className="text-2xl">🧮</span>
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
            ✕
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
            Apply Deal Parameters →
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
