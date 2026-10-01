"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { US_STATES } from "@/lib/utils/titleRules";
import { nearestState, stateName } from "@/lib/geo/us-states";

// Focused, skippable post-signup wizard. Captures the few preferences that unlock a personalized
// feed + sensible cost defaults, then drops the dealer straight into the scanner. Saves via
// /api/profile (same endpoint Settings uses).
const POPULAR_MAKES = [
  "Ford",
  "Chevrolet",
  "Toyota",
  "Honda",
  "Ram",
  "GMC",
  "Nissan",
  "Jeep",
  "BMW",
  "Tesla",
];

const VEHICLE_TYPES = [
  "Trucks",
  "SUVs",
  "Sedans",
  "Vans",
  "Luxury",
  "Performance",
  "Hybrid / EV",
];

const BUYING_LANES = [
  { label: "Salvage & repairable", value: "damaged" },
  { label: "Wholesale auctions", value: "auction" },
  { label: "Private & small dealers", value: "private" },
  { label: "Clean retail", value: "clean-retail" },
  { label: "Repo / government", value: "government" },
  { label: "Parts / teardown", value: "parts" },
];

const DEALER_FOCUS = [
  {
    name: "AE of Miami",
    host: "aeofmiami.com",
    note: "Miami / Denver salvage dealer",
  },
  {
    name: "Damage.com",
    host: "damage.com",
    note: "Sikeston repairable inventory",
  },
  {
    name: "D&G Auto",
    host: "dgautollc.com",
    note: "Missouri independent dealer",
  },
  { name: "ReCar", host: "recar.com", note: "Benton, MO rebuilder supply" },
  {
    name: "St. James Auto",
    host: "stjamesautoparts.com",
    note: "Parts and repairable units",
  },
  {
    name: "CAS Miami",
    host: "casmiami.com",
    note: "South Florida dealer supply",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  const [homeState, setHomeState] = useState("");
  const [targetProfit, setTargetProfit] = useState("3000");
  const [budgetMax, setBudgetMax] = useState("");
  const [makes, setMakes] = useState<string[]>([]);
  const [vehicleType, setVehicleType] = useState("SUVs");
  const [buyingLane, setBuyingLane] = useState("damaged");
  const [titleType, setTitleType] = useState("salvage");
  const [dealerHosts, setDealerHosts] = useState<string[]>([]);

  // If the dealer already finished onboarding, don't show the wizard again.
  useEffect(() => {
    let active = true;
    fetch("/api/profile")
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.profile?.onboarded) router.replace("/discover");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [router]);

  const toggleMake = (m: string) =>
    setMakes((cur) =>
      cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m],
    );
  const toggleDealer = (host: string) =>
    setDealerHosts((cur) =>
      cur.includes(host) ? cur.filter((x) => x !== host) : [...cur, host],
    );

  async function persist(extra: Record<string, unknown>) {
    try {
      await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ onboarded: true, ...extra }),
      });
    } catch {
      // non-fatal — defaults still work
    }
  }

  // Detect the user's state so onboarding is location-aware from the first screen.
  function detectLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Location isn’t available on this device");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const code = nearestState(pos.coords.latitude, pos.coords.longitude);
        if (code) {
          setHomeState(code);
          toast.success(`📍 ${stateName(code)}`);
        }
      },
      () => toast.error("Couldn’t get your location"),
      { timeout: 8000 },
    );
  }

  async function finish() {
    setSaving(true);
    await persist({
      home_state: homeState || undefined,
      state: homeState || undefined,
      target_profit: targetProfit ? Number(targetProfit) : undefined,
      budget_max: budgetMax ? Number(budgetMax) : undefined,
      preferred_makes: makes.length ? makes : undefined,
      vehicle_type: vehicleType,
      buying_lane: buyingLane,
      title_type: titleType,
      watched_dealer_hosts: dealerHosts.length ? dealerHosts : undefined,
    });
    if (dealerHosts.length) {
      try {
        localStorage.setItem("dealer-watch-v1", JSON.stringify(dealerHosts));
        window.dispatchEvent(new Event("dealer-watch-change"));
      } catch {
        /* non-fatal */
      }
    }
    // Seed the user's buyer scope even if they choose nationwide, so Discover and Scan start from
    // a concrete job rather than a generic dashboard.
    try {
      await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(homeState
            ? {
                carsState: homeState,
                carsStates: [homeState],
              }
            : {}),
          buyerScope: {
            vehicle: vehicleType,
            lane:
              BUYING_LANES.find((item) => item.value === buyingLane)?.label ||
              buyingLane,
            state: homeState || "Nationwide",
            titleType,
            maxPrice: budgetMax ? Number(budgetMax) : undefined,
            watchedDealers: dealerHosts,
          },
          watchedDealerHosts: dealerHosts,
        }),
      });
    } catch {
      /* non-fatal */
    }
    const params = new URLSearchParams();
    const vehicleQuery = vehicleType
      .toLowerCase()
      .replace("hybrid / ev", "hybrid ev");
    params.set("q", vehicleQuery);
    params.set("lane", buyingLane);
    if (homeState) params.set("state", homeState);
    if (titleType !== "all") params.set("titleType", titleType);
    if (budgetMax) params.set("maxPrice", budgetMax);
    params.set("sort", "profit");
    router.push(`/scan?${params.toString()}`);
  }

  // Even on skip, record that we offered onboarding so it doesn't nag every login.
  function skip() {
    persist({});
    router.push("/discover");
  }

  const inputClass =
    "w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-4 py-3 text-[var(--t1)]";

  const steps = [
    {
      title: "What are you trying to find?",
      sub: "Start with the job, not the dashboard. This becomes your default Scan scope.",
      body: (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Vehicle type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VEHICLE_TYPES.map((item) => {
                const on = vehicleType === item;
                return (
                  <button
                    key={item}
                    onClick={() => setVehicleType(item)}
                    className="rounded-[var(--r2)] border px-3 py-2 text-left text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--amber-lo)" : "var(--s0)",
                      color: on ? "var(--amber-d)" : "var(--t2)",
                      borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                    }}
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-2">
              Buying lane
            </label>
            <div className="grid grid-cols-1 gap-2">
              {BUYING_LANES.map((item) => {
                const on = buyingLane === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => setBuyingLane(item.value)}
                    className="rounded-[var(--r2)] border px-3 py-2 text-left text-sm font-bold transition-colors"
                    style={{
                      background: on ? "var(--amber-lo)" : "var(--s0)",
                      color: on ? "var(--amber-d)" : "var(--t2)",
                      borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Where do you buy & sell?",
      sub: "We’ll curate cars to your state — no unrelated markets — and price cross-state transport.",
      body: (
        <div className="space-y-3">
          <button
            onClick={detectLocation}
            className="w-full rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-3 text-sm font-bold text-[var(--t2)] hover:text-[var(--t1)]"
          >
            📍 Use my location
          </button>
          <select
            value={homeState}
            onChange={(e) => setHomeState(e.target.value)}
            className={inputClass}
          >
            <option value="">Select your home state</option>
            {US_STATES.map((s: string) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      ),
    },
    {
      title: "What’s your target?",
      sub: "Used to pre-fill your max-bid and flag deals worth your time.",
      body: (
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Title preference
            </label>
            <select
              value={titleType}
              onChange={(e) => setTitleType(e.target.value)}
              className={inputClass}
            >
              <option value="all">Any title</option>
              <option value="clean">Clean title</option>
              <option value="salvage">Salvage title</option>
              <option value="rebuilt">Rebuilt title</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Target profit per flip ($)
            </label>
            <input
              type="number"
              value={targetProfit}
              onChange={(e) => setTargetProfit(e.target.value)}
              className={inputClass}
              placeholder="3000"
            />
          </div>
          <div>
            <label className="block text-xs text-[var(--t4)] font-semibold mb-1">
              Max buy-in budget ($, optional)
            </label>
            <input
              type="number"
              value={budgetMax}
              onChange={(e) => setBudgetMax(e.target.value)}
              className={inputClass}
              placeholder="25000"
            />
          </div>
        </div>
      ),
    },
    {
      title: "Anything you focus on?",
      sub: "Pick a few makes to tune your “For You” feed. Optional — skip if you buy anything.",
      body: (
        <div className="flex flex-wrap gap-2">
          {POPULAR_MAKES.map((m) => {
            const on = makes.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleMake(m)}
                className="px-3.5 py-2 rounded-full text-sm font-semibold border transition-colors"
                style={{
                  background: on ? "var(--amber-lo)" : "var(--s0)",
                  color: on ? "var(--amber-d)" : "var(--t3)",
                  borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                }}
              >
                {m}
              </button>
            );
          })}
        </div>
      ),
    },
    {
      title: "Any shops you want watched?",
      sub: "Follow small salvage and rebuilder dealers so their fresh listings surface first.",
      body: (
        <div className="space-y-3">
          <div className="grid gap-2">
            {DEALER_FOCUS.map((dealer) => {
              const on = dealerHosts.includes(dealer.host);
              return (
                <button
                  key={dealer.host}
                  onClick={() => toggleDealer(dealer.host)}
                  className="rounded-[var(--r2)] border px-3 py-2 text-left transition-colors"
                  style={{
                    background: on ? "var(--amber-lo)" : "var(--s0)",
                    color: on ? "var(--amber-d)" : "var(--t2)",
                    borderColor: on ? "var(--amber-bd)" : "var(--b2)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-black">{dealer.name}</span>
                    <span className="text-xs font-black">
                      {on ? "Watching" : "Watch"}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs opacity-75">
                    {dealer.note} · {dealer.host}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="text-xs leading-relaxed text-[var(--t4)]">
            You can edit this anytime in Dealer network. Selected shops are
            saved locally now and synced to preferences when signed in.
          </p>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const cur = steps[step];

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--s1)" }}
    >
      <div
        className="w-full max-w-md glass-panel p-7"
        style={{ animation: "fadeUp 300ms ease-out" }}
      >
        {/* progress dots */}
        <div className="flex gap-1.5 mb-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className="h-1 flex-1 rounded-full"
              style={{ background: i <= step ? "var(--amber)" : "var(--b2)" }}
            />
          ))}
        </div>

        <h1 className="text-xl font-black text-[var(--t1)] mb-1">
          {cur.title}
        </h1>
        <p className="text-sm text-[var(--t3)] mb-6">{cur.sub}</p>

        <div className="mb-7">{cur.body}</div>

        <div className="flex items-center justify-between">
          <button
            onClick={skip}
            className="text-sm font-semibold text-[var(--t4)] hover:text-[var(--t2)]"
          >
            Skip for now
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2.5 rounded-[var(--r3)] font-bold text-sm bg-[var(--s2)] text-[var(--t2)]"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? finish() : setStep(step + 1))}
              disabled={saving}
              className="px-5 py-2.5 rounded-[var(--r3)] font-bold text-sm text-white disabled:opacity-50"
              style={{ background: "var(--amber)" }}
            >
              {isLast ? (saving ? "Saving…" : "Start finding deals") : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
