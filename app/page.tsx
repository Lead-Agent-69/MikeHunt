import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerUser } from "@/lib/server-supabase";
import { Ico } from "@/components/shared/Ico";
import { LiveCount } from "@/components/landing/LiveCount";
import { ProofBand } from "@/components/landing/ProofBand";
import { LiveDealShowcase } from "@/components/landing/LiveDealShowcase";

export const metadata = {
  title: "DealerHunt — Underpriced cars, deal-scored",
  description:
    "DealerHunt finds underpriced cars across every auction, marketplace, and dealer lot — each priced against the live market so you know exactly what to pay before you bid. Free, no paid data brokers.",
};

// One shared strip of proof points under the hero.
const PROOF = [
  { icon: "map" as const, text: "Scans all 50 states" },
  { icon: "trending-up" as const, text: "BUY / HOLD / PASS on every listing" },
  { icon: "check-circle" as const, text: "Free — no paid data brokers" },
];

// The 3-step story — what actually happens, in plain terms.
const HOW = [
  {
    icon: "scan" as const,
    title: "We scan everything",
    body: "Every auction, marketplace, and dealer lot — all 50 states, refreshed around the clock. The 40 tabs you'd never have time to open, in one feed.",
  },
  {
    icon: "calculator" as const,
    title: "We price it against reality",
    body: "Each listing is valued against real sold comps and its true title & condition — not the asking price. The honest number, not the hopeful one.",
  },
  {
    icon: "check-circle" as const,
    title: "You act with confidence",
    body: "BUY / HOLD / PASS and true net profit after fees, transport & recon — the decision handed to you before you commit a dollar.",
  },
];

// The edge — the things that are genuinely hard to get anywhere else (our moat, all real).
const EDGE = [
  {
    icon: "trending-up" as const,
    title: "Profit before you bid",
    body: "True net after fees, transport & recon. Every listing is a decision, not just a photo and a price.",
  },
  {
    icon: "shield" as const,
    title: "Title & condition truth",
    body: "Salvage / rebuilt / clean called per car, with VIN history and a cross-market sighting timeline. Never get burned by a hidden brand again.",
  },
  {
    icon: "search" as const,
    title: "Every source, one screen",
    body: "Auctions, marketplaces, and our salvage & rebuilder dealer network — deduped, scored, and ranked side by side.",
  },
  {
    icon: "map" as const,
    title: "Found first, nationwide",
    body: "Off-market and private supply surfaced and priced before the crowd — all 50 states, around the clock.",
  },
];

export default async function Home() {
  // Resolve whether a user is logged in, THEN redirect (never inside try/catch — a caught NEXT_REDIRECT
  // would be swallowed). Logged-in users go straight to the deal feed.
  let dest: string | null = null;
  try {
    const {
      data: { user },
    } = await getServerUser();
    if (user) dest = "/discover";
  } catch {
    // Not configured or no session — show the public landing.
  }
  if (dest) redirect(dest);

  return (
    <main className="min-h-screen flex flex-col bg-[var(--s1)] pb-safe">
      {/* Top bar */}
      <header className="w-full max-w-6xl mx-auto px-6 pt-7 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span
            className="w-8 h-8 rounded-[10px] grid place-items-center text-white shadow-sm"
            style={{ background: "var(--grad)" }}
            aria-hidden
          >
            <Ico name="search" size={17} />
          </span>
          <span className="text-[15px] font-bold tracking-tight text-[var(--t1)]">
            DealerHunt
          </span>
        </div>
        <Link
          href="/login"
          className="text-sm font-semibold text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
        >
          Sign in
        </Link>
      </header>

      {/* Hero */}
      <section className="flex flex-col items-center text-center px-6 pt-16 md:pt-24 pb-10">
        <span
          className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide uppercase px-3 py-1.5 rounded-full mb-8"
          style={{ background: "var(--amber-lo)", color: "var(--amber-d)" }}
        >
          Auto flip intelligence
        </span>

        <h1 className="serif text-[2.4rem] leading-[1.08] md:text-[3.8rem] font-semibold text-[var(--t1)] max-w-3xl tracking-tight">
          Underpriced cars.
          <br />
          <span
            style={{
              background: "var(--grad)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            Know exactly what to pay.
          </span>
        </h1>

        <p className="mt-6 text-base md:text-lg text-[var(--t3)] max-w-xl leading-relaxed">
          DealerHunt scans every source, prices each car against the live
          market, and tells you the profit before you bid.
        </p>

        <div className="mt-9 flex flex-col items-center gap-4">
          <Link
            href="/register"
            className="btn btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base shadow-[var(--shadow)] min-h-[52px]"
          >
            Get started free
            <Ico name="arrow" size={18} />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--t4)] hover:text-[var(--t2)] transition-colors"
          >
            Already have an account? Sign in
          </Link>
        </div>

        {/* Proof strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[13px] text-[var(--t4)]">
          {PROOF.map((p) => (
            <span key={p.text} className="inline-flex items-center gap-1.5">
              <Ico name={p.icon} size={15} className="text-[var(--t3)]" />
              {p.text}
            </span>
          ))}
        </div>
      </section>

      {/* SHOW, don't tell — real live deals scored right now (server-rendered, the strongest proof) */}
      <LiveDealShowcase />

      {/* PROOF IN NUMBERS — real live figures, animated */}
      <ProofBand />

      {/* The product */}
      <section className="w-full max-w-3xl mx-auto px-6 pt-16 pb-8">
        <div className="glass-panel p-7 flex flex-col gap-4 text-left">
          <div className="flex items-center gap-3">
            <span
              className="w-11 h-11 rounded-[14px] grid place-items-center text-xl"
              style={{ background: "var(--grad)" }}
              aria-hidden
            >
              🚗
            </span>
            <div>
              <h2 className="text-lg font-black text-[var(--t1)] leading-tight">
                DealerHunt
              </h2>
              <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--amber-d)]">
                Auto flip intelligence
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--t3)] leading-relaxed">
            Every auction &amp; marketplace, valued against real sold comps —
            BUY / HOLD / PASS the moment you see it, with the true net profit
            after fees, transport, and recon.
          </p>
          <LiveCount />
          <Link
            href="/register"
            className="mt-1 inline-flex items-center gap-2 self-start px-5 py-2.5 rounded-full font-bold text-[14px] text-white transition-transform hover:translate-x-0.5"
            style={{ background: "var(--grad)" }}
          >
            Explore cars
            <Ico name="arrow" size={16} />
          </Link>
        </div>
      </section>

      {/* WHY IT MATTERS — the problem, stated plainly */}
      <section className="w-full bg-[var(--s0)] border-y border-[var(--b1)]">
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t4)] mb-4">
            The problem
          </p>
          <p className="serif text-[1.5rem] md:text-[2rem] leading-snug text-[var(--t1)] font-medium">
            The best deals are hidden in{" "}
            <span className="text-[var(--t3)]">the wrong tab</span>, priced by{" "}
            <span className="text-[var(--t3)]">a hopeful seller</span>, and gone
            before you&apos;ve done the math.
          </p>
          <p className="mt-5 text-base text-[var(--t3)] leading-relaxed">
            Winners don&apos;t search harder — they see the whole market at once
            and know the number instantly. That&apos;s the entire job DealerHunt
            does for you.
          </p>
        </div>
      </section>

      {/* HOW IT WORKS — 3 steps */}
      <section className="w-full max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t4)] mb-3">
            How it works
          </p>
          <h2 className="serif text-[1.8rem] md:text-[2.4rem] font-semibold text-[var(--t1)]">
            Three steps. Zero guesswork.
          </h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {HOW.map((s, i) => (
            <div key={s.title} className="glass-panel p-7 flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span
                  className="w-11 h-11 rounded-[14px] grid place-items-center text-white"
                  style={{ background: "var(--grad)" }}
                  aria-hidden
                >
                  <Ico name={s.icon} size={20} />
                </span>
                <span className="text-3xl font-black text-[var(--b2)] tabular-nums">
                  0{i + 1}
                </span>
              </div>
              <h3 className="text-lg font-black text-[var(--t1)]">{s.title}</h3>
              <p className="text-sm text-[var(--t3)] leading-relaxed">
                {s.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* THE EDGE — why us, the moat */}
      <section className="w-full bg-[var(--s0)] border-y border-[var(--b1)]">
        <div className="max-w-5xl mx-auto px-6 py-20">
          <div className="text-center mb-12">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t4)] mb-3">
              Why DealerHunt
            </p>
            <h2 className="serif text-[1.8rem] md:text-[2.4rem] font-semibold text-[var(--t1)]">
              What you can&apos;t get anywhere else
            </h2>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            {EDGE.map((e) => (
              <div
                key={e.title}
                className="flex gap-4 p-6 rounded-[var(--r3)] bg-[var(--s1)] border border-[var(--b1)]"
              >
                <span
                  className="w-11 h-11 shrink-0 rounded-[12px] grid place-items-center text-[var(--t1)]"
                  style={{ background: "var(--s2)" }}
                  aria-hidden
                >
                  <Ico name={e.icon} size={19} />
                </span>
                <div>
                  <h3 className="text-[15px] font-black text-[var(--t1)] mb-1.5">
                    {e.title}
                  </h3>
                  <p className="text-sm text-[var(--t3)] leading-relaxed">
                    {e.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLOSING CTA */}
      <section className="w-full max-w-3xl mx-auto px-6 py-20 text-center">
        <h2 className="serif text-[2rem] md:text-[2.8rem] font-semibold text-[var(--t1)] leading-tight">
          See the deal before everyone else does.
        </h2>
        <p className="mt-5 text-base md:text-lg text-[var(--t3)] max-w-lg mx-auto leading-relaxed">
          Free to start. No paid data brokers, no credit card — just the whole
          market, scored, on one login.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4">
          <Link
            href="/register"
            className="btn btn-primary inline-flex items-center justify-center gap-2 px-8 py-4 text-base shadow-[var(--shadow)] min-h-[52px]"
          >
            Get started free
            <Ico name="arrow" size={18} />
          </Link>
          <Link
            href="/login"
            className="text-sm font-medium text-[var(--t4)] hover:text-[var(--t2)] transition-colors"
          >
            Already have an account? Sign in
          </Link>
        </div>
      </section>

      <footer className="w-full max-w-5xl mx-auto px-6 py-8 border-t border-[var(--b1)] text-xs text-[var(--t5)]">
        © {new Date().getFullYear()} DealerHunt — auto flip intelligence.
      </footer>
    </main>
  );
}
