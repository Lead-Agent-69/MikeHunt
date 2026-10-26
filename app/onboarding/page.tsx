"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  MapPin,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { MikeHuntLogo } from "@/components/brand/MikeHuntLogo";
import { accountMenuForMode } from "@/components/layout/nav-items";
import { FOCUSED_TOOLS } from "@/lib/workspace";
import { toast } from "sonner";
import { isSupabaseConfigured } from "@/lib/supabase";
import { confirmOnboardingSave } from "@/lib/preferences/confirm-onboarding";
import { safeNextPath } from "@/lib/auth/safe-next-path";
import { finishOnboardingNavigation } from "@/lib/auth/finish-onboarding-navigation";
import { includesRepairable } from "@/lib/intelligence/repair-risk";
import { US_STATES } from "@/lib/utils/titleRules";
import {
  type BuyerIntent,
  type BuyerMode,
  writeLocalBuyerIntent,
} from "@/hooks/useBuyerIntent";
import {
  BUYING_WORKSPACE_MODE,
  buyingWorkspaceScope,
} from "@/lib/buyer/workspace-scope";
import {
  onboardingHomeState,
  onboardingLocationPatch,
} from "@/lib/preferences/onboarding-location";

const VEHICLES = [
  "All vehicle types",
  "SUVs",
  "Trucks",
  "Sedans",
  "Coupes",
  "Convertibles",
  "Vans",
  "Luxury",
  "Hybrid / EV",
];
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
      aria-pressed={active}
      onClick={onClick}
      className="min-h-12 rounded-lg border px-3 py-3 text-left text-sm font-bold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
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
  const buyerMode: BuyerMode = BUYING_WORKSPACE_MODE;
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [accountRequired, setAccountRequired] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [vehicles, setVehicles] = useState<string[]>([]);
  const vehicle = vehicles.length ? vehicles.join(", ") : "All vehicle types";
  const [state, setState] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [titleType, setTitleType] = useState("all");
  const [timeline, setTimeline] = useState("now");
  const [repairCapability, setRepairCapability] = useState("none");
  const [includeRepairable, setIncludeRepairable] = useState(false);
  const [targetProfit, setTargetProfit] = useState("3000");
  const [savedPrefs, setSavedPrefs] = useState<Record<string, any> | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    setLoadError(false);
    setPrefsHydrated(false);
    const editing =
      new URLSearchParams(window.location.search).get("edit") === "1";
    Promise.all([fetch("/api/profile"), fetch("/api/preferences")])
      .then(async ([profileResponse, preferencesResponse]) => {
        if (!profileResponse.ok || !preferencesResponse.ok)
          throw new Error("Profile unavailable");
        const [profileData, preferencesData] = await Promise.all([
          profileResponse.json(),
          preferencesResponse.json(),
        ]);
        if (!active) return;
        confirmOnboardingSave(
          preferencesData,
          "preferences",
          {},
          isSupabaseConfigured(),
        );
        if (isSupabaseConfigured() && profileData?.authed === false)
          throw new Error("Session expired");
        setLoadError(false);
        if (profileData?.profile?.onboarded && !editing) {
          const destination = safeNextPath(
            new URLSearchParams(window.location.search).get("next"),
          );
          router.replace(
            new URL(destination, window.location.origin).pathname ===
              "/onboarding"
              ? "/market"
              : destination,
          );
          return;
        }
        const prefs = preferencesData?.prefs || null;
        setAccountRequired(preferencesData?.authed !== false);
        setSavedPrefs(prefs);
        const saved = prefs?.buyerScope as Partial<BuyerIntent> | undefined;
        const homeState = onboardingHomeState(prefs, saved?.state);
        if (homeState) setState(homeState);
        if (!saved) {
          setPrefsHydrated(true);
          return;
        }
        setVehicles(
          saved.vehicles?.length
            ? saved.vehicles
            : saved.vehicle && saved.vehicle !== "All vehicle types"
              ? [saved.vehicle]
              : [],
        );
        setMaxPrice(saved.maxPrice ? String(saved.maxPrice) : "");
        setTitleType(saved.titleType || "all");
        setTimeline(saved.timeline || "now");
        setRepairCapability(saved.repairCapability || "none");
        setIncludeRepairable(includesRepairable(saved));
        setTargetProfit(
          saved.targetProfit ? String(saved.targetProfit) : "3000",
        );
        setPrefsHydrated(true);
      })
      .catch(() => {
        if (active) setLoadError(true);
      });
    return () => {
      active = false;
    };
  }, [router, loadAttempt]);

  const intent = useMemo<BuyerIntent>(
    () => ({
      buyerMode,
      vehicle,
      vehicles,
      vehicleType:
        vehicle === "All vehicle types"
          ? undefined
          : vehicle.toLowerCase().replace(" / ", " "),
      state: state === "Nationwide" || US_STATES.includes(state) ? state : "",
      titleType,
      includeRepairable,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      targetProfit: Number(targetProfit || 0) || undefined,
      laneValue: titleType === "salvage" ? "damaged" : "all",
      lane: titleType === "salvage" ? "Salvage & repairable" : "All deals",
    }),
    [
      buyerMode,
      maxPrice,
      state,
      targetProfit,
      titleType,
      vehicle,
      vehicles,
      includeRepairable,
    ],
  );

  const previewHref = useMemo(() => {
    const params = new URLSearchParams();
    if (intent.state && US_STATES.includes(intent.state))
      params.set("states", intent.state);
    if (intent.minPrice) params.set("priceMin", String(intent.minPrice));
    if (intent.maxPrice) params.set("priceMax", String(intent.maxPrice));
    return `/market${params.size ? `?${params.toString()}` : ""}`;
  }, [intent]);

  const modeDetail =
    "Choose acceptable title and repair risk, and your target net margin.";

  const scopeChosen = state === "Nationwide" || US_STATES.includes(state);

  async function finish() {
    if (saving || !prefsHydrated || !buyerMode || !vehicle || !scopeChosen)
      return;
    if (
      (maxPrice &&
        (!Number.isFinite(Number(maxPrice)) || Number(maxPrice) < 0)) ||
      !Number.isFinite(Number(targetProfit)) ||
      Number(targetProfit) < 0
    ) {
      toast.error("Enter a valid non-negative budget and target profit.");
      return;
    }
    setSaving(true);
    const preferences = {
      buyerScope: buyingWorkspaceScope({
        ...savedPrefs?.buyerScope,
        ...intent,
        legacyBuyerMode:
          savedPrefs?.buyerScope?.legacyBuyerMode ??
          savedPrefs?.buyerScope?.buyerMode,
        timeline,
        repairCapability,
      }),
      // Home location (#66) + legacy mirrors; saved search markets are kept.
      ...onboardingLocationPatch(state, savedPrefs),
    };
    try {
      const preferenceResult = await fetch("/api/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...(accountRequired ? { "x-require-account": "true" } : {}),
        },
        body: JSON.stringify(preferences),
      });
      if (!preferenceResult.ok)
        throw new Error(
          "We could not save your buying profile. Please try again.",
        );
      const confirmedPreferences = await preferenceResult.json();
      if (accountRequired && confirmedPreferences.authed === false)
        throw new Error(
          "Your session has expired. Sign in again to save your buying profile.",
        );
      confirmOnboardingSave(
        confirmedPreferences,
        "preferences",
        preferences,
        isSupabaseConfigured(),
      );
      const profileResult = await fetch("/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accountRequired ? { "x-require-account": "true" } : {}),
        },
        body: JSON.stringify({
          onboarded: true,
          home_state: state && state !== "Nationwide" ? state : undefined,
          state: state && state !== "Nationwide" ? state : undefined,
          budget_max: maxPrice ? Number(maxPrice) : undefined,
          target_profit: Number(targetProfit || 0) || undefined,
        }),
      });
      if (!profileResult.ok || !preferenceResult.ok) {
        throw new Error("We could not save your buying profile.");
      }
      confirmOnboardingSave(
        await profileResult.json(),
        "profile",
        { onboarded: true },
        isSupabaseConfigured(),
      );
      toast.success("Your buying profile is ready");
      writeLocalBuyerIntent(intent);
      const requested = new URLSearchParams(window.location.search).get("next");
      const destination = safeNextPath(requested, previewHref);
      finishOnboardingNavigation(
        new URL(destination, window.location.origin).pathname === "/onboarding"
          ? previewHref
          : destination,
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Please try saving again.",
      );
      setSaving(false);
    }
  }

  const steps = [
    {
      title: "What vehicles are you looking for?",
      description: "Choose any vehicle types that interest you.",
      body: (
        <fieldset
          disabled={!prefsHydrated}
          className="grid grid-cols-2 gap-2 sm:grid-cols-3"
        >
          {VEHICLES.map((item) => (
            <ChoiceButton
              key={item}
              active={
                item === "All vehicle types"
                  ? vehicles.length === 0
                  : vehicles.includes(item)
              }
              onClick={() =>
                setVehicles((selected) =>
                  item === "All vehicle types"
                    ? []
                    : selected.includes(item)
                      ? selected.filter((value) => value !== item)
                      : [...selected, item],
                )
              }
            >
              {item}
            </ChoiceButton>
          ))}
        </fieldset>
      ),
    },
    {
      title: "Set your search boundary",
      description: "Set your home location and vehicle budget.",
      body: (
        <div className="space-y-5">
          <label className="block text-sm font-bold text-[var(--t2)]">
            Home state
            <span className="mt-0.5 block text-xs font-medium text-[var(--t4)]">
              Where you live. Add other markets to search in Settings.
            </span>
            <select
              value={state}
              onChange={(event) => setState(event.target.value)}
              className="mt-2 w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-3 text-[var(--t1)]"
            >
              <option value="">Choose a state</option>
              <option value="Nationwide">Nationwide</option>
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
          <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-[var(--t1)]">
            <input
              type="checkbox"
              checked={includeRepairable}
              onChange={(event) => setIncludeRepairable(event.target.checked)}
              className="h-5 w-5 accent-[var(--blue)]"
            />
            Include vehicles with reported damage or repair needs
          </label>
          <p className="text-sm text-[var(--t3)]">
            A clean title does not mean undamaged. Unknown condition still needs
            an inspection.
          </p>
          {includeRepairable && (
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
          {
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
          }
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
      description: "A search shaped around your goal, budget, and location.",
      body: (
        <div className="space-y-3">
          <div className="rounded-[var(--r3)] border border-[var(--accent)] bg-[var(--accent-surface)] p-4">
            <div className="flex items-center gap-2 text-sm font-black text-[var(--t1)]">
              <Sparkles className="h-4 w-4 text-[var(--accent)]" />
              Your buying workspace
            </div>
            <p className="mt-2 text-sm font-bold text-[var(--t2)]">
              {vehicle} · {state || "Nationwide"}
              {maxPrice ? ` · up to $${Number(maxPrice).toLocaleString()}` : ""}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--t4)]">
              Price evidence · Repair risk · Total purchase cost
            </p>
            <div className="mt-3 border-t border-[var(--b1)] pt-3">
              <h3 className="text-xs font-bold text-[var(--t2)]">
                Your workspace
              </h3>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[var(--t3)]">
                {accountMenuForMode(buyerMode)
                  .tools.filter((tool) =>
                    FOCUSED_TOOLS.has(tool.href.split("?")[0]),
                  )
                  .map((tool) => (
                    <li key={tool.href}>{tool.name}</li>
                  ))}
              </ul>
            </div>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3 text-sm text-[var(--t3)]">
            <div className="flex items-center gap-2 font-bold text-[var(--t2)]">
              <MapPin className="h-4 w-4" />
              Your search, your choices
            </div>
            <p className="mt-1 text-xs leading-relaxed">
              Your state starts with currently indexed listings. On Scan, use
              “Search inventory” to re-query what we already have, or “Find new
              matches” when you want DealerHunt to check eligible sources for
              this exact search.
            </p>
          </div>
          <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] p-3 text-sm text-[var(--t3)]">
            <div className="flex items-center gap-2 font-bold text-[var(--t2)]">
              <ShieldCheck className="h-4 w-4" />
              Evidence before a recommendation
            </div>
            <p className="mt-1 text-xs leading-relaxed">
              Review the original source, available listing observations, and
              missing evidence before you act. Observations are not an
              inspection or a verified sale price.
            </p>
          </div>
        </div>
      ),
    },
  ];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <main className="min-h-screen bg-[var(--s1)] px-4 pb-8 pt-5 sm:px-8">
      <header className="mx-auto flex max-w-3xl items-center justify-between gap-3 border-b border-[var(--b1)] pb-4">
        <div className="inline-flex" aria-hidden="true">
          <MikeHuntLogo size="md" />
        </div>
        <span className="text-xs font-medium text-[var(--t4)]">
          Your buying profile
        </span>
      </header>
      <section className="mx-auto w-full max-w-3xl py-6 sm:py-10">
        <ol
          className="mb-4 flex justify-between gap-2 text-[11px] font-semibold text-[var(--t4)]"
          aria-label="Setup progress"
        >
          {["Vehicles", "Location & budget", "Condition", "Ready"].map(
            (label, index) => (
              <li
                key={label}
                aria-current={index === step ? "step" : undefined}
                className={index === step ? "text-[var(--accent)]" : ""}
              >
                {index < step ? (
                  <Check className="mr-1 inline h-3 w-3" aria-hidden="true" />
                ) : (
                  `${index + 1}. `
                )}
                {label}
              </li>
            ),
          )}
        </ol>
        <div
          className="mb-7 flex gap-1.5"
          role="progressbar"
          aria-label="Setup completion"
          aria-valuemin={1}
          aria-valuenow={step + 1}
          aria-valuemax={steps.length}
          aria-valuetext={`Step ${step + 1} of ${steps.length}`}
        >
          {steps.map((_, index) => (
            <span
              key={index}
              aria-current={index === step ? "step" : undefined}
              className="h-1 flex-1 rounded-full"
              style={{
                background: index <= step ? "var(--accent)" : "var(--b2)",
              }}
            />
          ))}
        </div>
        <p className="text-xs font-semibold text-[var(--accent)]">
          Step {step + 1} of {steps.length}
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold text-[var(--t1)]">
          {current.title}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--t4)]">
          {current.description}
        </p>
        <div className="mt-7">{current.body}</div>
        {loadError && (
          <div role="alert" className="mt-4 text-sm text-[var(--red)]">
            <p>
              Your saved buying profile could not be loaded. Retry before saving
              changes.
            </p>
            <button
              type="button"
              onClick={() => {
                setLoadError(false);
                setLoadAttempt((value) => value + 1);
              }}
              className="mt-2 min-h-11 font-semibold"
            >
              Retry loading profile
            </button>
            <a href="/login" className="ml-4 font-semibold">
              Sign in again
            </a>
          </div>
        )}
        <div className="mt-8 flex items-center justify-between gap-3 border-t border-[var(--b1)] pt-5">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => setStep(step - 1)}
              disabled={saving}
              className="inline-flex min-h-12 items-center gap-2 px-3 py-2 text-sm font-bold text-[var(--t4)] disabled:opacity-60"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back
            </button>
          ) : (
            <span />
          )}

          <button
            type="button"
            onClick={() => (isLast ? finish() : setStep(step + 1))}
            disabled={saving || !prefsHydrated || (step === 1 && !scopeChosen)}
            className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {saving
              ? "Saving..."
              : loadError
                ? "Profile unavailable"
                : !prefsHydrated
                  ? "Loading profile..."
                  : isLast
                    ? "See my matches"
                    : "Continue"}
            {!saving && <ArrowRight size={16} aria-hidden="true" />}
          </button>
        </div>
      </section>
    </main>
  );
}
