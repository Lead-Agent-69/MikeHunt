"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { US_STATES } from "@/lib/utils/titleRules";
import {
  BUYER_MODES,
  buildBuyerIntentQuery,
  type BuyerIntent,
  type BuyerMode,
  writeLocalBuyerIntent,
} from "@/hooks/useBuyerIntent";

const VEHICLES = ["SUVs", "Trucks", "Sedans", "Vans", "Hybrid / EV"];
const TITLES = [
  { value: "all", label: "Any title" },
  { value: "clean", label: "Clean title only" },
  { value: "salvage", label: "Repairable is okay" },
];
const TIMELINES = [
  { value: "now", label: "Ready now" },
  { value: "month", label: "This month" },
  { value: "research", label: "Just researching" },
];

function ChoiceButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[var(--r2)] border px-3 py-3 text-left text-sm font-bold transition-colors"
      style={{
        background: active ? "var(--accent-surface)" : "var(--s0)",
        borderColor: active ? "var(--accent)" : "var(--b2)",
        color: active ? "var(--accent)" : "var(--t2)",
      }}
    >
      {children}
    </button>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [buyerMode, setBuyerMode] = useState<BuyerMode>("personal");
  const [vehicle, setVehicle] = useState("SUVs");
  const [state, setState] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [titleType, setTitleType] = useState("all");
  const [timeline, setTimeline] = useState("now");
  const [repairCapability, setRepairCapability] = useState("none");
  const [targetProfit, setTargetProfit] = useState("3000");

  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then((response) => response.json())
      .then((data) => {
        if (active && data?.profile?.onboarded) router.replace("/discover");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [router]);

  const intent = useMemo<BuyerIntent>(
    () => ({
      buyerMode,
      vehicle,
      vehicleType: vehicle.toLowerCase().replace(" / ", " "),
      state: state || "Nationwide",
      titleType,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      targetProfit:
        buyerMode === "reseller" || buyerMode === "dealer"
          ? Number(targetProfit || 0) || undefined
          : undefined,
      laneValue: titleType === "salvage" ? "damaged" : "all",
      lane: titleType === "salvage" ? "Salvage & repairable" : "All deals",
    }),
    [buyerMode, maxPrice, state, targetProfit, titleType, vehicle],
  );

  const previewHref = useMemo(() => {
    const params = buildBuyerIntentQuery(intent);
    return `/discover${params.size ? `?${params.toString()}` : ""}`;
  }, [intent]);

  const modeDetail =
    buyerMode === "diy"
      ? "Your repair comfort guides the evidence we prioritize."
      : buyerMode === "personal"
        ? "Reliability, safety, and total ownership cost lead your decision."
        : buyerMode === "reseller"
          ? "Profit, repair risk, and time-to-sale lead your decision."
          : "Inventory fit, capital, recon capacity, and turnover lead your decision.";

  async function finish() {
    setSaving(true);
    writeLocalBuyerIntent(intent);
    const preferences = {
      buyerScope: {
        ...intent,
        timeline,
        repairCapability: buyerMode === "diy" ? repairCapability : undefined,
      },
      ...(state ? { carsState: state, carsStates: [state] } : {}),
    };
    try {
      const [profileResult, preferenceResult] = await Promise.all([
        fetch("/api/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            onboarded: true,
            home_state: state || undefined,
            state: state || undefined,
            budget_max: maxPrice ? Number(maxPrice) : undefined,
            target_profit:
              buyerMode === "reseller" || buyerMode === "dealer"
                ? Number(targetProfit || 0) || undefined
                : undefined,
          }),
        }),
        fetch("/api/preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(preferences),
        }),
      ]);
      if (!profileResult.ok || !preferenceResult.ok) {
        throw new Error("We could not save your buying profile.");
      }
      toast.success("Your buying profile is ready");
      router.push(previewHref);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Please try saving again.",
      );
      setSaving(false);
    }
  }

  const steps = [
    {
      title: "What are you buying for?",
      description:
        "Your recommendation stays consistent, but the evidence and math adapt to your goal.",
      body: (
        <div className="grid gap-3 sm:grid-cols-2">
          {(Object.keys(BUYER_MODES) as BuyerMode[]).map((mode) => {
            const item = BUYER_MODES[mode];
            return (
              <ChoiceButton
                key={mode}
                active={buyerMode === mode}
                onClick={() => setBuyerMode(mode)}
              >
                <span className="block text-base text-[var(--t1)]">
                  {item.label}
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--t4)]">
                  {item.question}
                </span>
              </ChoiceButton>
            );
          })}
        </div>
      ),
    },
    {
      title: "Set your search boundary",
      description:
        "These choices narrow the cars and sources we show you. You can change them anytime.",
      body: (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-2">
            {VEHICLES.map((item) => (
              <ChoiceButton
                key={item}
                active={vehicle === item}
                onClick={() => setVehicle(item)}
              >
                {item}
              </ChoiceButton>
            ))}
          </div>
          <label className="block text-sm font-bold text-[var(--t2)]">
            Home state
            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="mt-2 w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-3 text-[var(--t1)]"
            >
              <option value="">Nationwide</option>
              {US_STATES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-bold text-[var(--t2)]">
            Maximum vehicle price
            <input
              value={maxPrice}
              onChange={(event) =>
                setMaxPrice(event.target.value.replace(/[^0-9]/g, ""))
              }
              inputMode="numeric"
              placeholder="No limit"
              className="mt-2 w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-3 text-[var(--t1)]"
            />
          </label>
        </div>
      ),
    },
    {
      title: "How much uncertainty works for you?",
      description: modeDetail,
      body: (
        <div className="space-y-5">
          <div className="grid gap-2">
            {TITLES.map((item) => (
              <ChoiceButton
                key={item.value}
                active={titleType === item.value}
                onClick={() => setTitleType(item.value)}
              >
                {item.label}
              </ChoiceButton>
            ))}
          </div>
          {buyerMode === "diy" && (
            <label className="block text-sm font-bold text-[var(--t2)]">
              Repair capability
              <select
                value={repairCapability}
                onChange={(event) => setRepairCapability(event.target.value)}
                className="mt-2 w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-3 text-[var(--t1)]"
              >
                <option value="none">I need professional repair support</option>
                <option value="basic">
                  Basic maintenance and cosmetic repairs
                </option>
                <option value="advanced">Mechanical repair experience</option>
              </select>
            </label>
          )}
          {(buyerMode === "reseller" || buyerMode === "dealer") && (
            <label className="block text-sm font-bold text-[var(--t2)]">
              Target net margin
              <input
                value={targetProfit}
                onChange={(event) =>
                  setTargetProfit(event.target.value.replace(/[^0-9]/g, ""))
                }
                inputMode="numeric"
                className="mt-2 w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-3 text-[var(--t1)]"
              />
            </label>
          )}
          <div className="grid grid-cols-3 gap-2">
            {TIMELINES.map((item) => (
              <ChoiceButton
                key={item.value}
                active={timeline === item.value}
                onClick={() => setTimeline(item.value)}
              >
                {item.label}
              </ChoiceButton>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "Your first search is ready",
      description:
        "MIKEHUNT does not run a broad crawl from setup. Refreshes use the source, location, and vehicle criteria you choose.",
      body: (
        <div className="space-y-3">
          <div className="rounded-[var(--r3)] border border-[var(--accent)] bg-[var(--accent-surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--t1)]">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              {BUYER_MODES[buyerMode].label}
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--t2)]">
              {vehicle} · {state || "Nationwide"}
              {maxPrice ? ` · under $${Number(maxPrice).toLocaleString()}` : ""}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
              {BUYER_MODES[buyerMode].priorities.join(" · ")}
            </p>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3 text-sm text-[var(--t3)]">
            <div className="flex items-center gap-2 font-bold text-[var(--t2)]">
              <MapPin className="h-4 w-4" />
              Scoped refresh policy
            </div>
            <p className="mt-1 text-xs leading-relaxed">
              Your first results load from matching inventory. You choose when
              to refresh, and saved watches refresh only within approved source
              timing.
            </p>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3 text-sm text-[var(--t3)]">
            <div className="flex items-center gap-2 font-bold text-[var(--t2)]">
              <ShieldCheck className="h-4 w-4" />
              Evidence before a recommendation
            </div>
            <p className="mt-1 text-xs leading-relaxed">
              Every listing keeps its source, last verified time, and missing
              evidence visible before you act.
            </p>
          </div>
        </div>
      ),
    },
  ];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--s1)] px-4 py-8">
      <section className="glass-panel w-full max-w-xl p-5 sm:p-8">
        <div
          className="mb-7 flex gap-1.5"
          aria-label={`Setup step ${step + 1} of ${steps.length}`}
        >
          {steps.map((_, index) => (
            <span
              key={index}
              className="h-1 flex-1 rounded-full"
              style={{
                background: index <= step ? "var(--accent)" : "var(--b2)",
              }}
            />
          ))}
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">
          Personalized vehicle intelligence
        </p>
        <h1 className="mt-2 text-2xl font-black text-[var(--t1)]">
          {current.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--t4)]">
          {current.description}
        </p>
        <div className="mt-7">{current.body}</div>
        <div className="mt-8 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() =>
              step > 0 ? setStep(step - 1) : router.push("/discover")
            }
            className="px-3 py-2 text-sm font-bold text-[var(--t4)]"
          >
            {step === 0 ? "Set up later" : "Back"}
          </button>
          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
            disabled={saving}
            className="rounded-[var(--r2)] bg-[var(--accent)] px-5 py-3 text-sm font-black text-white disabled:opacity-60"
          >
            {saving ? "Saving..." : isLast ? "See my matches" : "Continue"}
          </button>
        </div>
      </section>
    </main>
  );
}
