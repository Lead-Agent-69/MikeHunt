"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Printer,
  Copy,
  Check,
  X,
  ShieldCheck,
  Calendar,
  DollarSign,
  Car,
  Clock,
  Send,
  Building,
  User,
  Phone,
  Mail,
  Sparkles,
} from "lucide-react";
import { Mono } from "@/components/shared/Mono";

interface CashOfferModalProps {
  isOpen: boolean;
  onClose: () => void;
  deal: {
    id: string;
    vin?: string;
    year?: number;
    make?: string;
    model?: string;
    trim?: string;
    askPrice?: number;
    recommendedMaxBid?: number;
    targetOffer?: number;
    locationCity?: string;
    locationState?: string;
    sellerPhone?: string;
  };
}

export function CashOfferLetterModal({
  isOpen,
  onClose,
  deal,
}: CashOfferModalProps) {
  const initialOffer =
    deal.targetOffer ||
    deal.recommendedMaxBid ||
    (deal.askPrice ? Math.round(deal.askPrice * 0.88) : 5000);

  const [offerPrice, setOfferPrice] = useState<number>(initialOffer);
  // Buyer identity starts empty. It is only pre-filled from the signed-in
  // user's own saved profile (Settings), never from made-up defaults.
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [expirationHours, setExpirationHours] = useState(48);
  const [includeInspection, setIncludeInspection] = useState(true);
  const [includeCleanTitle, setIncludeCleanTitle] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();
    fetch("/api/profile", { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        // Guest/local profiles are not a verified identity; only use a real
        // signed-in profile.
        if (!data || data.local || !data.profile) return;
        const saved = savedBuyerIdentity(data.profile);
        if (saved.name) setBuyerName((v) => v || saved.name);
        if (saved.phone) setBuyerPhone((v) => v || saved.phone);
        if (saved.email) setBuyerEmail((v) => v || saved.email);
      })
      .catch(() => {
        // Leave fields empty; the user types their own details.
      });
    return () => controller.abort();
  }, [isOpen]);

  const contactLine =
    [buyerName, buyerPhone, buyerEmail]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" | ") || "[Your name and contact details]";

  const vehicleTitle =
    `${deal.year ?? ""} ${deal.make ?? ""} ${deal.model ?? ""} ${deal.trim ?? ""}`.trim() ||
    "Vehicle";
  const vinFormatted = deal.vin
    ? deal.vin.toUpperCase()
    : "AVAILABLE UPON INSPECTION";
  const locationFormatted =
    [deal.locationCity, deal.locationState].filter(Boolean).join(", ") ||
    "United States";
  const offerDate = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const offerTextSummary = `DRAFT LETTER OF INTENT (NON-BINDING)
Date: ${offerDate}
Vehicle: ${vehicleTitle} (VIN: ${vinFormatted})
Location: ${locationFormatted}

To the Seller,
I'd like to offer $${offerPrice.toLocaleString()} cash for your ${vehicleTitle}. This is a non-binding letter of intent; nothing is final until we both sign a purchase agreement.

OFFER TERMS:
• Payment: Immediate certified cashier's check / bank wire upon title transfer
• Inspection: ${includeInspection ? "Quick 24-hr mechanical & cosmetic verification" : "As-is with immediate closing"}
• Title: ${includeCleanTitle ? "Subject to clear, lien-free title at handover" : "Title transfer at DMV"}
• Expiration: Valid for ${expirationHours} hours from delivery

Contact: ${contactLine}
Please confirm if this works to schedule pickup and payment.`;

  function handleCopy() {
    navigator.clipboard.writeText(offerTextSummary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  function handlePrint() {
    window.print();
  }

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
        {/* Backdrop with OLED blur */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-xl"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-3xl border border-emerald-500/20 bg-[var(--s0)] text-[var(--t1)] shadow-2xl shadow-emerald-500/10 overflow-hidden z-10 print:static print:max-w-none print:shadow-none print:border-none print:bg-white print:text-black"
        >
          {/* Header Action Bar (Hidden in Print) */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--b1)] bg-[var(--s1)]/80 backdrop-blur-md print:hidden">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <FileText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-black tracking-tight text-[var(--t1)]">
                  Draft cash offer letter
                </h2>
                <p className="text-xs text-[var(--t3)] font-medium">
                  Draft letter of intent (non-binding) for you to review, edit
                  and send yourself
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--s2)] border border-[var(--b2)] text-xs font-bold text-[var(--t2)] hover:text-white hover:border-emerald-500/40 transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                    Copied Text
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy for SMS
                  </>
                )}
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 text-black text-xs font-black shadow-md shadow-emerald-500/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <Printer className="h-3.5 w-3.5 fill-black" />
                Print / Save PDF
              </button>

              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-[var(--t4)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors ml-1"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Modal Content / Printable Body */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6">
            {/* Offer Inputs Ribbon (Hidden in Print) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl bg-[var(--s1)]/70 border border-[var(--b2)] print:hidden">
              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--t4)] mb-1 block">
                  Cash Offer Amount ($)
                </label>
                <div className="relative">
                  <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-emerald-400" />
                  <input
                    type="number"
                    value={offerPrice}
                    onChange={(e) => setOfferPrice(Number(e.target.value))}
                    className="w-full pl-8 pr-3 py-2 rounded-xl bg-[var(--s2)] border border-[var(--b2)] text-sm font-black text-[var(--t1)] focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--t4)] mb-1 block">
                  Buyer / Dealership Name
                </label>
                <input
                  type="text"
                  value={buyerName}
                  placeholder="Your business name"
                  onChange={(e) => setBuyerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--s2)] border border-[var(--b2)] text-sm font-bold text-[var(--t1)] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--t4)] mb-1 block">
                  Buyer Phone Number
                </label>
                <input
                  type="text"
                  value={buyerPhone}
                  placeholder="Your phone number"
                  onChange={(e) => setBuyerPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--s2)] border border-[var(--b2)] text-sm font-bold text-[var(--t1)] focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-wider text-[var(--t4)] mb-1 block">
                  Buyer Email
                </label>
                <input
                  type="email"
                  value={buyerEmail}
                  placeholder="Your email"
                  onChange={(e) => setBuyerEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--s2)] border border-[var(--b2)] text-sm font-bold text-[var(--t1)] focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <p
              data-testid="cash-offer-draft-note"
              className="text-xs leading-relaxed text-[var(--t3)] print:hidden"
            >
              This is a draft for you to review before you use it. MikeHunt
              doesn&apos;t send this letter to anyone and doesn&apos;t make a
              binding offer on your behalf. Check the terms with your own
              advisor if you need a legally binding agreement.
            </p>

            {/* Document Letterhead (High-end Visor Style + Crisp Print Form) */}
            <div className="p-8 rounded-3xl bg-[var(--s1)]/40 border border-[var(--b2)] space-y-6 shadow-inner print:p-0 print:border-none print:bg-white print:text-black">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-[var(--b2)] pb-6 print:border-black">
                <div>
                  <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400 print:text-black">
                    Draft letter of intent (non-binding)
                  </span>
                  <h1 className="text-2xl font-black text-[var(--t1)] mt-1 tracking-tight print:text-black">
                    Cash Purchase Proposal
                  </h1>
                  <p className="text-xs text-[var(--t4)] mt-1 print:text-gray-600">
                    Document Ref: MH-{deal.id.slice(0, 8).toUpperCase()}-
                    {new Date().getFullYear()}
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-[var(--t2)] print:text-black">
                    Date of Presentation
                  </div>
                  <Mono className="text-sm font-bold text-emerald-400 print:text-black">
                    {offerDate}
                  </Mono>
                  <div className="text-[10px] text-amber-400 mt-1 font-semibold uppercase print:text-black">
                    Valid for {expirationHours} Hours
                  </div>
                </div>
              </div>

              {/* Vehicle & Seller Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-2xl bg-[var(--s0)] border border-[var(--b1)] print:border-gray-300 print:bg-gray-50">
                <div>
                  <div className="text-[10px] font-bold uppercase text-[var(--t4)] print:text-gray-600">
                    Vehicle Description
                  </div>
                  <div className="text-sm font-black text-[var(--t1)] mt-0.5 print:text-black">
                    {vehicleTitle}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-[var(--t4)] print:text-gray-600">
                    VIN Identifier
                  </div>
                  <Mono className="text-xs font-bold text-[var(--t2)] mt-0.5 print:text-black">
                    {vinFormatted}
                  </Mono>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-[var(--t4)] print:text-gray-600">
                    Location
                  </div>
                  <div className="text-xs font-bold text-[var(--t2)] mt-0.5 print:text-black">
                    {locationFormatted}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase text-[var(--t4)] print:text-gray-600">
                    Current Asking Price
                  </div>
                  <Mono className="text-xs font-bold text-[var(--t3)] line-through mt-0.5 print:text-black">
                    {deal.askPrice
                      ? `$${deal.askPrice.toLocaleString()}`
                      : "Unstated"}
                  </Mono>
                </div>
              </div>

              {/* The Offer Amount Box */}
              <div className="p-6 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-[var(--s2)] to-emerald-950/20 border border-emerald-500/30 flex flex-col sm:flex-row items-center justify-between gap-4 print:border-black print:bg-gray-100">
                <div>
                  <div className="text-xs font-black uppercase tracking-wider text-emerald-400 print:text-black">
                    Proposed Cash Offer
                  </div>
                  <div className="text-xs text-[var(--t3)] mt-0.5 print:text-gray-700">
                    Payment upon in-person handover and title verification, as
                    agreed between buyer and seller.
                  </div>
                </div>
                <div className="text-right">
                  <Mono className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight print:text-black">
                    ${offerPrice.toLocaleString()}
                  </Mono>
                  <div className="text-[10px] font-bold uppercase text-[var(--t4)] print:text-gray-600">
                    USD Cashier Check / Certified Wire
                  </div>
                </div>
              </div>

              {/* Legal Terms & Contingencies */}
              <div className="space-y-3">
                <div className="text-xs font-black uppercase tracking-wider text-[var(--t2)] print:text-black">
                  Contingencies & Closing Procedures
                </div>
                <ol className="list-decimal list-inside space-y-2 text-xs leading-relaxed text-[var(--t3)] print:text-gray-800">
                  <li>
                    <strong className="text-[var(--t1)] print:text-black">
                      Marketable Title:{" "}
                    </strong>
                    Seller warrants that they hold legal authority to convey the
                    vehicle and guarantees title is free of unliquidated liens,
                    undisclosed salvage branding, or legal encumbrances.
                  </li>
                  <li>
                    <strong className="text-[var(--t1)] print:text-black">
                      Physical Verification:{" "}
                    </strong>
                    Buyer reserves the right to conduct a brief 20-minute
                    physical inspection to confirm odometer accuracy, absence of
                    structural damage, and operational status prior to final
                    fund disbursement.
                  </li>
                  <li>
                    <strong className="text-[var(--t1)] print:text-black">
                      Closing & Expedited Logistics:{" "}
                    </strong>
                    Upon inspection approval, Buyer will issue immediate payment
                    and arrange transport/pickup within 48 business hours at no
                    expense or inconvenience to Seller.
                  </li>
                  <li>
                    <strong className="text-[var(--t1)] print:text-black">
                      Offer Validity:{" "}
                    </strong>
                    This non-binding proposal is open for {expirationHours}{" "}
                    hours from delivery, after which it lapses unless extended
                    in writing. No sale is binding until both parties sign a
                    purchase agreement.
                  </li>
                </ol>
              </div>

              {/* Signatures Block */}
              <div className="grid grid-cols-2 gap-8 pt-8 border-t border-[var(--b2)] print:border-black">
                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-wider text-[var(--t2)] print:text-black">
                    Buyer Representation
                  </div>
                  <div className="h-10 border-b border-dashed border-[var(--b3)] flex items-end pb-1 font-serif italic text-emerald-400 print:text-black">
                    {buyerName || " "}
                  </div>
                  <div className="text-[11px] text-[var(--t3)] print:text-gray-700">
                    Authorized Signer:{" "}
                    <span className="text-[var(--t1)] print:text-black font-semibold">
                      {buyerName || "________________"}
                    </span>
                    <br />
                    Phone: {buyerPhone || "________________"} | Email:{" "}
                    {buyerEmail || "________________"}
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="text-xs font-black uppercase tracking-wider text-[var(--t2)] print:text-black">
                    Seller Acceptance
                  </div>
                  <div className="h-10 border-b border-dashed border-[var(--b3)] flex items-end pb-1 text-[var(--t5)] print:border-black print:text-gray-400">
                    Signature &amp; Acceptance Date
                  </div>
                  <div className="text-[11px] text-[var(--t3)] print:text-gray-700">
                    Seller Name: ____________________________________
                    <br />
                    Driver's License / ID State: ____________________
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function savedBuyerIdentity(profile: Record<string, unknown>): {
  name: string;
  phone: string;
  email: string;
} {
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    name: str(profile.name) || str(profile.full_name),
    phone: str(profile.phone),
    email: str(profile.email),
  };
}
