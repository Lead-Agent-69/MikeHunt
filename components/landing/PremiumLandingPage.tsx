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
  LiveCounter,
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
} from "@/components/ui/framer-components";

// ─────────────────────────────────────────────────────────────────────────────

const PROOF = [
  { icon: "🗺️", text: "All 50 states" },
  { icon: "⚡", text: "Real-time scraping" },
  { icon: "✅", text: "Free — no credit card" },
  { icon: "🧠", text: "AI-powered deal scoring" },
];

const HOW = [
  {
    num: "01",
    icon: "📡",
    title: "We scan everything",
    body: "Every auction, marketplace & dealer lot — all 50 states, around the clock. The 40 tabs you'd never have time to open, in one live feed.",
    color: "var(--amber)",
  },
  {
    num: "02",
    icon: "🧮",
    title: "We price it against reality",
    body: "Each listing is valued against real sold comps and true title & condition. The honest number, not the hopeful asking price.",
    color: "var(--purple)",
  },
  {
    num: "03",
    icon: "🎯",
    title: "You act with confidence",
    body: "BUY / HOLD / PASS with true net profit after fees, transport & recon — the decision handed to you before you commit a dollar.",
    color: "#00ff66",
  },
];

const EDGE = [
  {
    icon: "📈",
    title: "Profit before you bid",
    body: "True net after fees, transport & recon. Every listing is a decision, not just a photo and a price.",
    glow: "var(--amber)",
  },
  {
    icon: "🛡️",
    title: "Title & condition truth",
    body: "Salvage / rebuilt / clean called per car, with VIN history and cross-market sighting timeline.",
    glow: "var(--purple)",
  },
  {
    icon: "🌐",
    title: "Every source, one screen",
    body: "Auctions, marketplaces, and salvage & rebuilder network — deduped, scored, and ranked side by side.",
    glow: "#5b9bef",
  },
  {
    icon: "🔍",
    title: "Found first, nationwide",
    body: "Off-market and private supply surfaced before the crowd — all 50 states, around the clock.",
    glow: "#00ff66",
  },
];

const SAMPLE_DEALS = [
  { year: 2021, make: "BMW", model: "M3 Competition", price: "$62,500", estRetail: "$74,800", profit: "+$8,400", score: 94, source: "Manheim Auction", vin: "WBS83AY05M12****", location: "Dallas, TX" },
  { year: 2020, make: "Toyota", model: "Tacoma TRD Pro", price: "$33,200", estRetail: "$41,000", profit: "+$5,100", score: 88, source: "Copart Direct", vin: "3TMCZ5AN8LM9****", location: "Phoenix, AZ" },
  { year: 2022, make: "Ford", model: "F-150 Raptor", price: "$71,000", estRetail: "$82,500", profit: "+$6,700", score: 91, source: "FB Marketplace", vin: "1FTFW1RG4NFB****", location: "Atlanta, GA" },
  { year: 2023, make: "Dodge", model: "Challenger Hellcat", price: "$59,900", estRetail: "$70,500", profit: "+$7,200", score: 89, source: "IAAI Salvage", vin: "2C3CDZC97PH6****", location: "Miami, FL" },
];

// Simulated live deal feed for the hero section
const LIVE_DEALS = [
  { year: 2020, make: "BMW", model: "M3", profit: "+$8,400", verdict: "GO", score: 94 },
  { year: 2019, make: "Toyota", model: "Tacoma", profit: "+$5,100", verdict: "GO", score: 88 },
  { year: 2022, make: "Ford", model: "F-150", profit: "+$6,700", verdict: "GO", score: 91 },
  { year: 2021, make: "Honda", model: "CR-V", profit: "+$3,200", verdict: "GO", score: 76 },
  { year: 2018, make: "Chevrolet", model: "Tahoe", profit: "+$4,800", verdict: "GO", score: 83 },
  { year: 2023, make: "Dodge", model: "Challenger", profit: "+$7,200", verdict: "GO", score: 89 },
];

// ─────────────────────────────────────────────────────────────────────────────

function HeroSection() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.12 } },
  };
  const item = {
    hidden: { opacity: 0, y: 30 },
    show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 100, damping: 15 } },
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
        style={{ background: "radial-gradient(circle, var(--amber) 0%, transparent 70%)" }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full blur-[100px] opacity-20"
        style={{ background: "radial-gradient(circle, var(--purple) 0%, transparent 70%)" }}
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
            <span className="w-2 h-2 rounded-full bg-[var(--amber)] animate-pulse" />
            MikeHunt Auto Flip Intelligence · Live Now
            <BorderBeam duration={6} size={80} colorFrom="var(--amber)" colorTo="var(--purple)" />
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
          MikeHunt scans every auction, marketplace & dealer lot — priced
          against live sold comps — and tells you the true profit{" "}
          <span className="text-[var(--t1)] font-semibold">before you bid</span>.
        </motion.p>

        {/* Liquid Glass & Liquid Metal CTAs */}
        <motion.div variants={item} className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-12">
          <LiquidMetalButton href="/register">
            <span>⚡ Start Free Trial</span>
          </LiquidMetalButton>

          <LiquidGlassButton href="/scan" variant="default" size="lg">
            View Live Intelligence Feed <span className="text-lg">→</span>
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

      {/* Live Deal Feed — scrolling ticker */}
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
              <span className="text-xs font-black text-[#00ff66] bg-[rgba(0,255,102,0.15)] px-2 py-0.5 rounded-full">
                {d.verdict}
              </span>
              <span className="text-sm font-bold text-[var(--t1)]">
                {d.year} {d.make} {d.model}
              </span>
              <span className="font-mono text-sm font-black text-[#00ff66]">{d.profit}</span>
              <span className="text-xs font-bold text-[var(--t4)] font-mono">IQ {d.score}</span>
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
            Experience our 3D Flipping Book component. Click any card below to turn it over and inspect hidden margin details, VIN comps, and market spread.
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
                        IQ {deal.score}
                      </span>
                      <span className="text-xs text-[var(--t4)]">{deal.source}</span>
                    </div>
                    <h4 className="text-lg font-black text-[var(--t1)] mb-1">
                      {deal.year} {deal.make} {deal.model}
                    </h4>
                    <p className="text-xs text-[var(--t4)] mb-4">{deal.location}</p>
                  </div>
                  <div>
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="text-xs text-[var(--t4)]">Asking</span>
                      <span className="text-lg font-bold font-mono text-[var(--t1)]">{deal.price}</span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-xs text-[var(--t4)]">Est Net Profit</span>
                      <span className="text-xl font-black font-mono text-[#00ff66]">{deal.profit}</span>
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
                      {deal.year} {deal.make} {deal.model}
                    </h5>
                    <div className="space-y-2 text-xs font-mono">
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Est. Retail:</span>
                        <span className="text-[var(--t1)]">{deal.estRetail}</span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>VIN:</span>
                        <span className="text-[var(--t2)]">{deal.vin}</span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Est. Transport:</span>
                        <span className="text-[var(--t2)]">$450</span>
                      </div>
                      <div className="flex justify-between text-[var(--t3)]">
                        <span>Est. Recon:</span>
                        <span className="text-[var(--t2)]">$850</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href="/scan"
                    className="w-full text-center py-2 px-3 rounded-lg text-xs font-bold text-white bg-[var(--grad)] hover:opacity-90 transition-opacity"
                  >
                    Open Live Analysis →
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
            Hover over any deal folder below to see real-time stacked documents expand with interactive 3D motion.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <RealFolder label="High Margin Sports Cars" count={14} color="var(--amber)">
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2021 BMW M3 Comp — +$8,400</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2023 Dodge Hellcat — +$7,200</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2020 Porsche 911 — +$12,100</div>
            </div>
          </RealFolder>

          <RealFolder label="Trucks & Heavy Utility" count={28} color="var(--purple)">
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2022 Ford F-150 Raptor — +$6,700</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2020 Toyota Tacoma — +$5,100</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2019 Chevy Silverado — +$4,900</div>
            </div>
          </RealFolder>

          <RealFolder label="Fast Flip Commuters" count={42} color="#00ff66">
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2021 Honda Civic EX — +$3,400</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2020 Toyota Camry SE — +$3,800</div>
              <div className="p-2 rounded bg-[var(--s1)] border border-[var(--b2)]">2019 Hyundai Elantra — +$2,900</div>
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
    { value: 12400, label: "Active Deals", suffix: "+", prefix: "" },
    { value: 4, label: "Live Sources", suffix: "", prefix: "" },
    { value: 50, label: "States Covered", suffix: "", prefix: "" },
    { value: 94, label: "Avg Deal IQ Score", suffix: "%", prefix: "" },
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
                <LiveCounter
                  value={s.value}
                  prefix={s.prefix}
                  suffix={s.suffix}
                  duration={2}
                />
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
              transition={{ delay: i * 0.15, type: "spring" as const, stiffness: 80 }}
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
                <h3 className="text-xl font-black text-[var(--t1)] mb-3">{s.title}</h3>
                <p className="text-sm text-[var(--t3)] leading-relaxed">{s.body}</p>

                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
                  style={{ background: `linear-gradient(90deg, transparent, ${s.color}88, transparent)` }}
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
          Winners don't search harder — they see the whole market at once and
          know the number instantly. That's the entire job MikeHunt does for you.
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
                <h3 className="text-base font-black text-[var(--t1)] mb-2">{e.title}</h3>
                <p className="text-sm text-[var(--t3)] leading-relaxed">{e.body}</p>
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
          background: "radial-gradient(ellipse 80% 60% at 50% 100%, rgba(242,91,154,0.1), transparent)",
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
          See the deal before{" "}
          <GradientText>everyone else does.</GradientText>
        </h2>
        <p className="text-xl text-[var(--t3)] max-w-xl mx-auto leading-relaxed mb-12">
          Free to start. No credit card, no paid data brokers — just the
          whole market, scored, on one login.
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
  const [activeTab, setActiveTab] = useRef<string>("feed").current ? ["feed", () => {}] as const : [ "feed", (k: string) => {} ];

  return (
    <main className="min-h-screen flex flex-col bg-[var(--s1)] pb-safe overflow-hidden">
      {/* Framer Marketplace Pill Dropdown Navigation Bar */}
      <header className="fixed top-4 left-0 right-0 z-50 flex items-center justify-between px-6 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-black/40 backdrop-blur-xl">
          <span className="text-sm font-black tracking-tight text-white">🔍 MikeHunt</span>
        </div>

        <div className="pointer-events-auto hidden sm:block">
          <PillDropdownNav
            items={[
              { key: "feed", label: "Live Feed", icon: "⚡" },
              { key: "deals", label: "Deals 3D", icon: "🃏" },
              { key: "folders", label: "Workspaces", icon: "📁" },
            ]}
            activeKey="feed"
            onChange={() => {}}
          />
        </div>

        <div className="pointer-events-auto">
          <LiquidGlassButton href="/scan" variant="primary" size="sm">
            Launch App →
          </LiquidGlassButton>
        </div>
      </header>

      <div>
        <HeroSection />
        <InteractiveDealShowcase />
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

