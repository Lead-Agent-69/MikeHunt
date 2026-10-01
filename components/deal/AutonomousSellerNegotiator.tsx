"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Send,
  CheckCircle,
  Bot,
  PhoneCall,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";

export function AutonomousSellerNegotiator({
  dealId = "deal-1",
  vin,
  locationCity,
  locationState,
  vehicleTitle = "this vehicle",
  askingPrice = 0,
  targetOffer = 0,
  sellerPhone = "",
}: {
  dealId?: string;
  vin?: string;
  locationCity?: string;
  locationState?: string;
  vehicleTitle?: string;
  askingPrice?: number;
  targetOffer?: number;
  sellerPhone?: string;
}) {
  const [offerAmount, setOfferAmount] = useState(targetOffer);
  const [depositAmount, setDepositAmount] = useState(1000);
  const [closingHours, setClosingHours] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [sentSuccess, setSentSuccess] = useState(false);
  const [showLetterModal, setShowLetterModal] = useState(false);

  const [chatLog, setChatLog] = useState([
    {
      id: "1",
      sender: "bot",
      text: `Draft only: Hi, I saw your ${vehicleTitle}${askingPrice ? ` listed for $${askingPrice.toLocaleString()}` : ""}. I'm a verified buyer ready to fund ${offerAmount ? `$${offerAmount.toLocaleString()}` : "a market-based cash offer"} today with ${depositAmount ? `$${depositAmount.toLocaleString()}` : "a"} deposit. Can close within ${closingHours} hours.`,
      time: "10:14 AM",
    },
  ]);

  const handleSendOffer = () => {
    setIsSending(true);
    setTimeout(() => {
      setIsSending(false);
      setSentSuccess(true);
      setChatLog((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          sender: "bot",
          text: "Draft saved locally. Real SMS/Messenger sending and seller replies require a connected messaging provider.",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }, 1200);
  };

  return (
    <div className="rounded-3xl border border-[var(--b2)] bg-[var(--s0)] p-6 shadow-2xl relative overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl grid place-items-center text-white bg-gradient-to-br from-[var(--purple)] to-[#00ff66]">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-black text-[var(--t1)]">
              Autonomous Seller Negotiator
            </h3>
            <p className="text-xs text-[var(--t4)]">
              AI-driven SMS & Messenger cash outreach bot with parameter
              constraints
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 font-mono text-xs text-[var(--t4)]">
          <span className="w-2 h-2 rounded-full bg-[#00ff66] animate-pulse" />
          <span>Seller: {sellerPhone}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Controls Column */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] space-y-3 font-mono text-xs">
            <div>
              <label className="text-[var(--t4)] block mb-1">
                Target Opening Cash Offer ($)
              </label>
              <input
                type="number"
                value={offerAmount}
                onChange={(e) => setOfferAmount(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-sm font-bold text-[var(--t1)]"
              />
            </div>

            <div>
              <label className="text-[var(--t4)] block mb-1">
                Immediate Wire Deposit ($)
              </label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-sm font-bold text-[var(--t1)]"
              />
            </div>

            <div>
              <label className="text-[var(--t4)] block mb-1">
                Guaranteed Closing Time (Hours)
              </label>
              <input
                type="number"
                value={closingHours}
                onChange={(e) => setClosingHours(Number(e.target.value))}
                className="w-full p-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] text-sm font-bold text-[var(--t1)]"
              />
            </div>
          </div>

          <button
            onClick={handleSendOffer}
            disabled={isSending}
            className="w-full py-3.5 px-6 rounded-2xl font-black text-sm text-white shadow-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: "var(--grad)" }}
          >
            <Send className="w-4 h-4" />
            {isSending
              ? "Dispatching SMS Bot..."
              : "Dispatch Automated Offer SMS →"}
          </button>

          <button
            onClick={() => setShowLetterModal(true)}
            className="w-full py-2.5 px-4 rounded-2xl font-bold text-xs text-[var(--t1)] bg-[var(--s2)] border border-emerald-500/30 hover:border-emerald-500/60 shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <FileText className="w-4 h-4 text-emerald-400" />
            Generate Official Cash Offer Letter (LOI / PDF)
          </button>
        </div>

        {/* Live Conversation Transcript */}
        <div className="lg:col-span-7 p-4 rounded-2xl border border-[var(--b2)] bg-[var(--s1)] flex flex-col justify-between h-80">
          <div className="overflow-y-auto space-y-3 font-sans text-xs">
            {chatLog.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "bot" ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] p-3 rounded-2xl ${
                    msg.sender === "bot"
                      ? "bg-[var(--purple)] text-white rounded-br-none font-medium"
                      : "bg-[var(--s0)] border border-[var(--b2)] text-[var(--t1)] rounded-bl-none"
                  }`}
                >
                  <p className="leading-relaxed">{msg.text}</p>
                </div>
                <span className="text-[10px] text-[var(--t5)] mt-1 font-mono">
                  {msg.time}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-[var(--b2)] flex items-center justify-between text-[11px] font-mono text-[var(--t4)]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#00ff66]" /> Verified
              Buyer Protocol Active
            </span>
            <span>SMS Transport: Twilio Cloud</span>
          </div>
        </div>
      </div>

      <CashOfferLetterModal
        isOpen={showLetterModal}
        onClose={() => setShowLetterModal(false)}
        deal={{
          id: dealId,
          vin,
          askPrice: askingPrice,
          targetOffer: offerAmount,
          locationCity,
          locationState,
          sellerPhone,
        }}
      />
    </div>
  );
}
