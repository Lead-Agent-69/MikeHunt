"use client";

import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import {
  DotGridBackground,
  Meteors,
  BorderBeam,
  Spotlight,
  ShineBorder,
  GradientText,
  BentoCard,
} from "@/components/ui/premium-visuals";
import {
  TextReveal,
  LiquidGlassButton,
  LiquidMetalButton,
  PillDropdownNav,
  InteractivePattern,
  FlipCard,
  RealFolder,
  LiquidGlassFooter,
  SwitchOnHoverTabs,
  FilterableGallery,
  DNACarousel,
} from "@/components/ui/framer-components";

// ─────────────────────────────────────────────────────────────────────────────

const PROOF = [
  { icon: "⏸️", text: "Market feed not connected" },
  { icon: "📋", text: "No sold comps on this page" },
  { icon: "✅", text: "Free to start — no credit card" },
  { icon: "🚫", text: "No score until a listing is fetched" },
];

const HOW = [
  {
    num: "01",
    icon: "📡",
    title: "Connect a source first",
    body: "Auctions, marketplaces, and dealer lots are not scanning from this page. A feed shows up only after a source is connected and returns listings.",
    color: "var(--amber)",
  },
  {
    num: "02",
    icon: "🧮",
    title: "Prices come from fetched data",
    body: "Ask, basis, and sample size have to come from a listing or a sold-comp feed. This page does not invent wholesale, retail, or profit.",
    color: "var(--purple)",
  },
  {
    num: "03",
    icon: "🎯",
    title: "Then you decide",
    body: "Buy, hold, or pass only after the card shows ask, basis, and n. Fees, transport, and recon stay blank until they are measured.",
    color: "#00ff66",
  },
];

const EDGE = [
  {
    icon: "📈",
    title: "Profit only with a basis",
    body: "Net after fees, transport, and recon is the product goal. It is not shown as cash until those inputs exist on a fetched listing.",
    glow: "var(--amber)",
  },
  {
    icon: "🛡️",
    title: "Title and condition when sourced",
    body: "Salvage, rebuilt, or clean is stated per car only when the listing or a history source says so. No VIN story is filled in.",
    glow: "var(--purple)",
  },
  {
    icon: "🌐",
    title: "Sources you connect",
    body: "Connected auctions and marketplaces can sit on one screen. This page does not claim every lot is already in the feed.",
    glow: "#5b9bef",
  },
  {
    icon: "🔍",
    title: "Coverage is what you set",
    body: "State and radius come from your settings. Until that scope is saved, this is not a nationwide live search.",
    glow: "#00ff66",
  },
];

const SAMPLE_DEALS = [
  {
    year: 0,
    make: "Auction",
    model: "Auction Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "live-auction-feed",
    location: "Real source required",
  },
  {
    year: 0,
    make: "Dealer",
    model: "Wholesale Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "dealer-wholesale-feed",
    location: "Real source required",
  },
  {
    year: 0,
    make: "Salvage",
    model: "Repairable Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "salvage-repairable-feed",
    location: "Real source required",
  },
  {
    year: 0,
    make: "Private",
    model: "Marketplace Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "private-marketplace-feed",
    location: "Real source required",
  },
];

// Extended set for the 3D helix carousel — needs 6+ cards for a full ring
const HELIX_DEALS = [
  ...SAMPLE_DEALS,
  {
    year: 0,
    make: "Fleet",
    model: "Liquidation Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "fleet-liquidation-feed",
    location: "Real source required",
  },
  {
    year: 0,
    make: "Sold",
    model: "Comp Feed",
    price: "Connect",
    estRetail: "Data",
    profit: "Not measured",
    score: 0,
    source: "Not configured",
    vin: "sold-comp-feed",
    location: "Real source required",
  },
];

// Hero ticker: not a live scan. Sources are not configured.
const LIVE_DEALS = [
  {
    year: 0,
    make: "Auction",
    model: "Feed",
    profit: "Not measured",
    verdict: "NOT LIVE",
    score: 0,
  },
  {
    year: 0,
    make: "Salvage",
    model: "Feed",
    profit: "Not measured",
    verdict: "NOT LIVE",
    score: 0,
  },
  {
    year: 0,
    make: "Wholesale",
    model: "Feed",
    profit: "Not measured",
    verdict: "NOT LIVE",
    score: 0,
  },
  {
    year: 0,
    make: "Private",
    model: "Feed",
    profit: "Not measured",
    verdict: "NOT LIVE",
    score: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12 } },
  };
  const item = {
    hidden: { opacity: 0, y: 30 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: "spring" as const, stiffness: 100, damping: 15 },
    },
  };

  return (
    <section
      ref={ref}
      className="relative min-h-[92vh] flex flex-col items-center justify-center overflow-hidden bg-[var(--s1)] px-6 text-center pt-24 pb-16"
    >
      {/* Ambient Framer Marketplace Interactive Pattern */}
      <InteractivePattern gridSize={32} className="opacity-40" />
      <DotGridBackground />
      <Meteors count={15} />
      <Spotlight fill="rgba(242,91,154,0.12)" />

      {/* Glowing orbs */}
      <div
        className="pointer-events-none absolute top-1/3 left-1/4 w-96 h-96 rounded-full blur-[120px] opacity-30"
        style={{
          background:
            "radial-gradient(circle, var(--amber) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-[100px] opacity-20"
        style={{
          background:
            "radial-gradient(circle, var(--purple) 0%, transparent 70%)",
        }}
        aria-hidden
      />

      <motion.div
        style={{ y, opacity }}
        variants={container}
        initial="hidden"
        animate="show"
        className="relative z-10 max-w-4xl mx-auto"
      >
        {/* Badge */}
        <motion.div variants={item} className="flex justify-center mb-8">
          <div className="relative inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-[var(--amber-bd)] bg-[var(--amber-lo)] text-sm font-bold text-[var(--amber-d)]">
            <span className="w-2 h-2 rounded-full bg-[var(--t4)]" />
            Sources not connected · Not a live scan
            <BorderBeam
              duration={6}
              size={80}
              colorFrom="var(--amber)"
              colorTo="var(--purple)"
            />
          </div>
        </motion.div>

        {/* Headline with Framer Text Reveal */}
        <motion.h1
          variants={item}
          className="text-[2.8rem] sm:text-[4rem] md:text-[5.2rem] font-black leading-[1.02] tracking-tight text-[var(--t1)] mb-6"
        >
          <TextReveal text="Underpriced cars." />{" "}
          <br className="hidden sm:block" />
          <GradientText from="#ff7a4d" via="#f25b9a" to="#9b6bff">
            Know exactly what to pay.
          </GradientText>
        </motion.h1>

        {/* Sub */}
        <motion.p
          variants={item}
          className="text-lg md:text-xl text-[var(--t3)] max-w-2xl mx-auto leading-relaxed mb-10"
        >
          MikeHunt is a workspace for car listings once sources are connected.
          This page is not a live scan, and it does not show sold comps or
          profit.
        </motion.p>

        {/* Liquid Glass & Liquid Metal CTAs */}
        <motion.div
          variants={item}
          className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12"
        >
          <LiquidMetalButton href="/register">
            <span>Start free</span>
          </LiquidMetalButton>

          <LiquidGlassButton href="/status" variant="default" size="lg">
            Check source status <span className="text-lg">→</span>
          </LiquidGlassButton>
        </motion.div>

        {/* Proof strip */}
        <motion.div
          variants={item}
          className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-[var(--t4)]"
        >
          {PROOF.map((p) => (
            <span key={p.text} className="inline-flex items-center gap-1.5">
              <span>{p.icon}</span>
              {p.text}
            </span>
          ))}
        </motion.div>
      </motion.div>

      {/* Not-configured ticker — not a live scan */}
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.8 }}
        className="mt-12 w-full overflow-hidden"
      >
        <div className="flex gap-4 ticker-inner px-4">
          {[...LIVE_DEALS, ...LIVE_DEALS].map((d, i) => (
            <div
              key={i}
              className="flex items-center gap-3 shrink-0 px-4 py-2.5 rounded-xl border border-[var(--b2)] bg-[var(--s0)] backdrop-blur-lg"
              style={{ backdropFilter: "blur(20px)" }}
            >
              <span className="text-xs font-black text-[var(--t3)] bg-[var(--s2)] px-2 py-0.5 rounded-full">
                {d.verdict}
              </span>
              <span className="text-sm font-bold text-[var(--t1)]">
                {d.make} {d.model}
              </span>
              <span className="font-mono text-sm text-[var(--t4)]">
                {d.profit}
              </span>
              <span className="text-xs font-bold text-[var(--t4)]">
                No score
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function InteractiveDealShowcase() {
  return (
    <section className="relative py-24 bg-[var(--s0)] border-y border-[var(--b2)] px-6 overflow-hidden">
      <DotGridBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-3">
            Framer 3D Interactive Components
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)] mb-4">
            Click to Flip & Inspect Deals
          </h2>
          <p className="text-base text-[var(--t3)] max-w-xl mx-auto">
            Layout preview only. Cards below are placeholders, not listings.
            Nothing on the back is a comp, a fee, or a profit.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {SAMPLE_DEALS.map((deal) => (
            <FlipCard
              key={deal.vin}
              className="h-80"
              front={
                <div className="h-full flex flex-col justify-between p-6">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-mono font-bold text-[var(--amber-d)] bg-[var(--amber-lo)] px-2 py-0.5 rounded-full">
                        No score
                      </span>
                      <span className="text-xs text-[var(--t4)]">
                        {deal.source}
                      </span>
                    </div>
                    <h4 className="text-lg font-black text-[var(--t1)] mb-1">
                      {deal.year ? `${deal.year} ` : ""}
                      {deal.make} {deal.model}
                    </h4>
                    <p className="text-xs text-[var(--t4)] mb-4">
                      {deal.location}
                    </p>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-[var(--t4)]">Asking</span>
                      <span className="text-lg font-bold font-mono text-[var(--t1)]">
                        {deal.price}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-[var(--t4)]">
                        Est Net Profit
                      </span>
                      <span className="text-xl font-black font-mono text-[var(--green)]">
                        {deal.profit}
                      </span>
                    </div>
                    <p className="text-[11px] text-[var(--t5)] text-center mt-4 italic">
                      Click to flip 🔄
                    </p>
                  </div>
                </div>
              }
              back={
                <div className="h-full flex flex-col justify-between p-6">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--purple-d)]">
                      Intelligence Audit
                    </span>
                    <h5 className="text-sm font-bold text-[var(--t1)] mt-1 mb-3">
                      {deal.year ? `${deal.year} ` : ""}
                      {deal.make} {deal.model}
                    </h5>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Est. Retail:</span>
                        <span className="text-[var(--t1)]">
                          {deal.estRetail}
                        </span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>VIN:</span>
                        <span className="text-[var(--t2)]">{deal.vin}</span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Transport:</span>
                        <span className="text-[var(--t2)]">Not measured</span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Recon:</span>
                        <span className="text-[var(--t2)]">Not measured</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href="/status"
                    className="w-full text-center py-2 px-3 rounded-lg text-xs font-bold text-white bg-[var(--grad)] hover:opacity-90 transition-opacity"
                  >
                    Source status →
                  </Link>
                </div>
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function DNADealShowcase() {
  return (
    <section className="relative py-24 bg-[var(--s1)] px-6 overflow-hidden">
      <DotGridBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-12">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-3">
            Framer DNA Carousel Component
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)] mb-4">
            The Deal Helix
          </h2>
          <p className="text-base text-[var(--t3)] max-w-xl mx-auto">
            A layout preview only. These cards are not live listings, not
            scored, and not priced from sold comps.
          </p>
        </div>

        <DNACarousel
          height={380}
          radius={280}
          cardWidth={240}
          items={HELIX_DEALS.map((deal) => ({
            id: deal.vin,
            content: (
              <div className="h-full flex flex-col justify-between p-5 text-left">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono font-bold text-[var(--amber-d)] bg-[var(--amber-lo)] px-2 py-0.5 rounded-full">
                      No score
                    </span>
                    <span className="text-[10px] text-[var(--t4)]">
                      {deal.source}
                    </span>
                  </div>
                  <h4 className="text-base font-black text-[var(--t1)] leading-tight mb-1">
                    {deal.year ? `${deal.year} ` : ""}
                    {deal.make} {deal.model}
                  </h4>
                  <p className="text-[11px] text-[var(--t4)]">
                    {deal.location}
                  </p>
                </div>
                <div className="space-y-1 font-mono">
                  <div className="flex justify-between text-[11px] text-[var(--t4)]">
                    <span>Asking</span>
                    <span className="text-[var(--t1)] font-bold">
                      {deal.price}
                    </span>
                  </div>
                  <div className="flex justify-between text-[11px] text-[var(--t4)]">
                    <span>Est Retail</span>
                    <span className="text-[var(--t2)]">{deal.estRetail}</span>
                  </div>
                  <div className="flex justify-between items-baseline pt-1 border-t border-[var(--b1)]">
                    <span className="text-[11px] text-[var(--t4)]">
                      Net Profit
                    </span>
                    <span className="text-lg font-black text-[var(--green)]">
                      {deal.profit}
                    </span>
                  </div>
                </div>
              </div>
            ),
          }))}
        />
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function FoldersAndCollectionsShowcase() {
  return (
    <section className="relative py-24 bg-[var(--s1)] px-6 overflow-hidden">
      <DotGridBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-3">
            Framer Real Folder Component
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)] mb-4">
            Interactive Deal Workspaces
          </h2>
          <p className="text-base text-[var(--t3)] max-w-xl mx-auto">
            Hover over any deal folder below to see real-time stacked documents
            expand with interactive 3D motion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <RealFolder
            label="Sports cars — example workspace"
            color="var(--amber)"
          >
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Live sports feed — pending connection
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Sold comps — pending connection
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Profit model — pending data
              </div>
            </div>
          </RealFolder>

          <RealFolder
            label="Trucks — example workspace"
            color="var(--purple)"
          >
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Wholesale truck feed — pending connection
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Regional demand — pending data
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Transport model — pending setup
              </div>
            </div>
          </RealFolder>

          <RealFolder label="Commuters — example workspace" color="#00ff66">
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Retail commuter feed — pending connection
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Turn-speed model — pending data
              </div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">
                Buyer demand — pending setup
              </div>
            </div>
          </RealFolder>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function StatsSection() {
  const stats = [
    { display: "—", label: "Listings connected" },
    { display: "0", label: "Sources live" },
    { display: "—", label: "Sold comps on file" },
    { display: "n/a", label: "Deal score" },
  ];

  return (
    <section className="relative border-y border-[var(--b2)] bg-[var(--s0)] py-16 overflow-hidden">
      <DotGridBackground />
      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, type: "spring", stiffness: 100 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-black text-[var(--t1)] mb-1 font-mono">
                {s.display}
              </div>
              <p className="text-sm text-[var(--t4)] font-semibold uppercase tracking-widest">
                {s.label}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function HowItWorks() {
  return (
    <section className="relative py-28 bg-[var(--s1)] overflow-hidden px-6">
      <DotGridBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-3">
            How it works
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)] leading-tight">
            <TextReveal text="Three steps. Zero guesswork." />
          </h2>
        </motion.div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-6">
          {HOW.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{
                delay: i * 0.15,
                type: "spring" as const,
                stiffness: 80,
              }}
            >
              <BentoCard glowColor={s.color} className="h-full">
                <div className="flex items-center gap-3 mb-5">
                  <span className="text-3xl">{s.icon}</span>
                  <span
                    className="text-5xl font-black opacity-20 font-mono"
                    style={{ color: s.color }}
                  >
                    {s.num}
                  </span>
                </div>
                <h3 className="text-xl font-black text-[var(--t1)] mb-3">
                  {s.title}
                </h3>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  {s.body}
                </p>

                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${s.color}88, transparent)`,
                  }}
                />
              </BentoCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function ProblemSection() {
  return (
    <section className="relative py-24 overflow-hidden bg-[var(--s0)] border-y border-[var(--b2)] px-6">
      <Meteors count={8} />
      <div className="relative z-10 max-w-3xl mx-auto text-center">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-4"
        >
          The problem
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl md:text-4xl font-black text-[var(--t1)] leading-tight mb-6"
        >
          The best deals hide in the wrong tab, priced by a{" "}
          <span className="text-[var(--t4)]">hopeful seller</span>, and gone
          before you've done the math.
        </motion.p>
        <motion.p
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="text-lg text-[var(--t3)] leading-relaxed"
        >
          The product is meant to put listings and a basis on one screen.
          That does not happen until a source is connected. Nothing above is
          that feed.
        </motion.p>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function EdgeSection() {
  return (
    <section className="relative py-28 bg-[var(--s1)] overflow-hidden px-6">
      <DotGridBackground />
      <div className="relative z-10 max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <p className="text-xs font-black uppercase tracking-[0.25em] text-[var(--t4)] mb-3">
            Why MikeHunt
          </p>
          <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)]">
            <TextReveal text="What you can't get anywhere else" />
          </h2>
        </motion.div>

        {/* Bento Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {EDGE.map((e, i) => (
            <motion.div
              key={e.title}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: i * 0.1, type: "spring" as const }}
            >
              <BentoCard glowColor={e.glow} className="h-full">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl mb-4"
                  style={{ background: `${e.glow}22` }}
                >
                  {e.icon}
                </div>
                <h3 className="text-base font-black text-[var(--t1)] mb-2">
                  {e.title}
                </h3>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  {e.body}
                </p>
              </BentoCard>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function CTASection() {
  return (
    <section className="relative py-32 overflow-hidden bg-[var(--s0)] px-6">
      <Meteors count={12} />
      <Spotlight fill="rgba(155,107,255,0.1)" />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(242,91,154,0.1), transparent)",
        }}
        aria-hidden
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 max-w-3xl mx-auto text-center"
      >
        <h2 className="text-4xl md:text-5xl font-black text-[var(--t1)] leading-tight mb-6">
          See the deal before <GradientText>everyone else does.</GradientText>
        </h2>
        <p className="text-xl text-[var(--t3)] max-w-xl mx-auto leading-relaxed mb-12">
          Free to start. No credit card. Coverage, scores, and profit show up
          only after a source returns real listings.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-5">
          <LiquidGlassButton href="/register" variant="primary" size="lg">
            Start for free <span className="text-xl">→</span>
          </LiquidGlassButton>

          <Link
            href="/login"
            className="text-sm font-semibold text-[var(--t4)] hover:text-[var(--t1)] transition-colors"
          >
            Sign in to your account
          </Link>
        </div>
      </motion.div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function PremiumLandingPage() {
  const [activeTab, setActiveTab] = useRef<string>("feed").current
    ? (["feed", () => {}] as const)
    : ["feed", (k: string) => {}];

  return (
    <main className="min-h-screen flex flex-col bg-[var(--s1)] pb-safe overflow-hidden">
      {/* Framer Marketplace Pill Dropdown Navigation Bar */}
      <header className="fixed top-4 left-0 right-0 z-50 flex items-center justify-between px-6 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl">
          <span className="text-sm font-black tracking-tight text-white">
            🔍 MikeHunt
          </span>
        </div>

        <div className="pointer-events-auto hidden sm:block">
          <PillDropdownNav
            items={[
              { key: "feed", label: "Overview", icon: "•" },
              { key: "deals", label: "Deals 3D", icon: "🃏" },
              { key: "folders", label: "Workspaces", icon: "📁" },
            ]}
            activeKey="feed"
            onChange={() => {}}
          />
        </div>

        <div className="pointer-events-auto">
          <LiquidGlassButton href="/register" variant="primary" size="sm">
            Start free →
          </LiquidGlassButton>
        </div>
      </header>

      <div>
        <HeroSection />
        <InteractiveDealShowcase />
        <DNADealShowcase />
        <FoldersAndCollectionsShowcase />
        <StatsSection />
        <ProblemSection />
        <HowItWorks />
        <EdgeSection />
        <CTASection />
      </div>

      {/* Framer Marketplace Liquid Glass Footer */}
      <LiquidGlassFooter
        links={[
          { label: "Terms of Service", href: "/tos" },
          { label: "Privacy Policy", href: "/privacy" },
          { label: "Changelog", href: "/changelog" },
          { label: "Status", href: "/status" },
        ]}
      />
    </main>
  );
}
