import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";

const outcomes = [
  {
    icon: ShieldCheck,
    title: "Know what needs checking",
    copy: "Keep title claims, condition evidence, and unanswered questions together before you act.",
  },
  {
    icon: ClipboardCheck,
    title: "Set a real buying ceiling",
    copy: "See the purchase amount alongside the costs that change the decision.",
  },
  {
    icon: BadgeCheck,
    title: "Move with a clear next step",
    copy: "Shortlist, inspect, pass, or take a vehicle into your acquisition workflow.",
  },
];

const paths = [
  {
    icon: CarFront,
    title: "Find a vehicle",
    copy: "Start with the vehicle, location, condition, and budget that matter to you.",
  },
  {
    icon: Search,
    title: "Check a listing",
    copy: "Bring a listing into one place to review costs, evidence, and open questions.",
  },
];

export function PremiumLandingPage() {
  return (
    <main className="min-h-screen bg-[var(--s1)] text-[var(--t1)]">
      <header className="sticky top-0 z-40 border-b border-[var(--b1)] bg-[var(--s0)]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" aria-label="MIKEHUNT home" className="shrink-0">
            <MikeHuntLogo size="sm" />
          </Link>
          <nav
            className="hidden items-center gap-7 md:flex"
            aria-label="Public navigation"
          >
            <a
              className="text-sm font-semibold text-[var(--t3)] transition-colors hover:text-[var(--t1)]"
              href="#how-it-works"
            >
              How it works
            </a>
            <a
              className="text-sm font-semibold text-[var(--t3)] transition-colors hover:text-[var(--t1)]"
              href="#for-buyers"
            >
              For buyers
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-semibold text-[var(--t2)] transition-colors hover:text-[var(--accent)] sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-bold text-[var(--on-accent)] transition-colors hover:bg-[var(--amber-d)]"
            >
              Get started <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-[var(--b1)] bg-[var(--s0)]">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] opacity-[0.13] lg:block"
          style={{
            backgroundImage: "url('/images/car-placeholder.jpg')",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
          }}
        />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 pb-16 pt-16 sm:px-6 sm:pb-20 sm:pt-24 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
          <div className="max-w-3xl">
            <p className="mb-5 text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              Vehicle acquisition, made clear
            </p>
            <h1 className="max-w-3xl text-4xl font-black leading-[1.05] tracking-normal text-[var(--t1)] sm:text-5xl lg:text-6xl">
              Find the next vehicle worth your time.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--t3)]">
              MIKEHUNT brings your buying criteria, vehicle evidence, and next
              decision into one focused workspace.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 text-base font-bold text-[var(--on-accent)] transition-colors hover:bg-[var(--amber-d)]"
              >
                Build your buying plan{" "}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex min-h-12 items-center justify-center rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-5 text-base font-bold text-[var(--t1)] transition-colors hover:border-[var(--accent)]"
              >
                Open your workspace
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm font-medium text-[var(--t3)]">
              <span className="inline-flex items-center gap-2">
                <CheckCircle2
                  size={17}
                  className="text-[var(--green)]"
                  aria-hidden="true"
                />{" "}
                Personal, DIY, resale, and dealer modes
              </span>
              <span className="inline-flex items-center gap-2">
                <CheckCircle2
                  size={17}
                  className="text-[var(--green)]"
                  aria-hidden="true"
                />{" "}
                Evidence stays attached to the decision
              </span>
            </div>
          </div>
          <aside className="self-end border border-[var(--b2)] bg-[var(--s0)] p-5 shadow-[var(--shadow2)] sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[var(--t1)]">
                Your first search
              </span>
              <SlidersHorizontal
                size={18}
                className="text-[var(--accent)]"
                aria-hidden="true"
              />
            </div>
            <div className="mt-6 space-y-4">
              <div className="border-b border-[var(--b1)] pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t4)]">
                  Buying for
                </p>
                <p className="mt-1 text-base font-bold">
                  The vehicle that fits your goal
                </p>
              </div>
              <div className="border-b border-[var(--b1)] pb-4">
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t4)]">
                  Market
                </p>
                <p className="mt-1 inline-flex items-center gap-2 text-base font-bold">
                  <MapPin
                    size={16}
                    className="text-[var(--accent)]"
                    aria-hidden="true"
                  />{" "}
                  Your location and radius
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.12em] text-[var(--t4)]">
                  Decision
                </p>
                <p className="mt-1 text-base font-bold">
                  Evidence, all-in cost, and a next step
                </p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section
        id="for-buyers"
        className="border-b border-[var(--b1)] bg-[var(--s1)]"
      >
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex max-w-2xl flex-col gap-3">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
              Start where you are
            </p>
            <h2 className="text-3xl font-black tracking-normal sm:text-4xl">
              Two direct paths. One reliable decision record.
            </h2>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {paths.map(({ icon: Icon, title, copy }) => (
              <Link
                key={title}
                href="/register"
                className="group border border-[var(--b2)] bg-[var(--s0)] p-6 transition-colors hover:border-[var(--accent)]"
              >
                <Icon
                  size={26}
                  className="text-[var(--accent)]"
                  aria-hidden="true"
                />
                <h3 className="mt-5 text-xl font-black">{title}</h3>
                <p className="mt-2 max-w-md leading-7 text-[var(--t3)]">
                  {copy}
                </p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)]">
                  Get started <ArrowRight size={16} aria-hidden="true" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-[var(--s0)]">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--accent)]">
                A better buying workflow
              </p>
              <h2 className="mt-3 text-3xl font-black tracking-normal sm:text-4xl">
                Work from evidence, not urgency.
              </h2>
            </div>
            <Link
              href="/register"
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--accent)] hover:text-[var(--amber-d)]"
            >
              Create your workspace <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </div>
          <div className="mt-10 grid gap-8 border-t border-[var(--b1)] pt-8 md:grid-cols-3">
            {outcomes.map(({ icon: Icon, title, copy }, index) => (
              <article key={title} className="relative pr-4">
                <span className="text-sm font-black text-[var(--accent)]">
                  0{index + 1}
                </span>
                <Icon
                  size={24}
                  className="mt-6 text-[var(--t1)]"
                  aria-hidden="true"
                />
                <h3 className="mt-4 text-lg font-black">{title}</h3>
                <p className="mt-2 leading-7 text-[var(--t3)]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--b1)] bg-[var(--s1)]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <MikeHuntLogo size="sm" />
          <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-[var(--t3)]">
            <Link href="/privacy" className="hover:text-[var(--t1)]">
              Privacy
            </Link>
            <Link href="/tos" className="hover:text-[var(--t1)]">
              Terms
            </Link>
            <Link href="/login" className="hover:text-[var(--t1)]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
