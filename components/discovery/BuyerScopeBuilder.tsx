"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  MapPin,
  Car,
  Gavel,
  Wrench,
  Store,
  Landmark,
  Star,
  Sparkles,
} from "lucide-react";
import { planScrapeForBuyerScope } from "@/lib/scrapers/buyer-scope";

const VEHICLE_TYPES = [
  {
    label: "Trucks",
    q: "truck",
    hint: "F-150, Silverado, Tacoma, work trucks",
  },
  { label: "SUVs", q: "suv", hint: "Family haulers, 4x4s, third-row" },
  { label: "Sedans", q: "sedan", hint: "Commuters and fast-turn retail" },
  { label: "Vans", q: "van", hint: "Cargo, passenger, delivery" },
  { label: "Luxury", q: "luxury", hint: "Premium trims and arbitrage" },
  {
    label: "Performance",
    q: "performance",
    hint: "Sports cars and enthusiast demand",
  },
  { label: "Diesel", q: "diesel", hint: "Heavy duty and utility buyers" },
  {
    label: "Hybrid / EV",
    q: "hybrid ev",
    hint: "Fuel saver and electric inventory",
  },
];

const LANES = [
  {
    label: "All deals",
    lane: "all",
    icon: Search,
    hint: "Everything live in inventory",
  },
  {
    label: "Salvage & repairable",
    lane: "damaged",
    titleType: "salvage",
    icon: Wrench,
    hint: "Copart/IAA-style rebuild candidates",
  },
  {
    label: "Wholesale auctions",
    lane: "auction",
    icon: Gavel,
    hint: "Dealer auction and bid lanes",
  },
  {
    label: "Private & retail",
    lane: "private",
    icon: Store,
    hint: "Marketplace and independent sellers",
  },
  {
    label: "Clean retail",
    lane: "clean-retail",
    titleType: "clean",
    icon: Car,
    hint: "Ready-to-retail inventory",
  },
  {
    label: "Repo / government",
    lane: "government",
    q: "repo government surplus",
    icon: Landmark,
    hint: "Fleet, seized, municipal supply",
  },
  {
    label: "Parts / teardown",
    lane: "parts",
    q: "parts teardown",
    icon: Wrench,
    hint: "Parts, teardown, and recon signals",
  },
  {
    label: "Specialty",
    lane: "specialty",
    q: "classic collector specialty",
    icon: Star,
    hint: "Classic, collector, exotic",
  },
];

const STATES = [
  "Nationwide",
  "TX",
  "CA",
  "FL",
  "GA",
  "NC",
  "AZ",
  "OH",
  "MI",
  "PA",
];

function cx(active: boolean) {
  return active
    ? "border-[var(--b3)] bg-[var(--t1)] text-[var(--s0)] shadow-sm"
    : "border-[var(--b1)] bg-[var(--s0)] text-[var(--t2)] hover:border-[var(--b3)]";
}

export function BuyerScopeBuilder() {
  const [vehicle, setVehicle] = useState(VEHICLE_TYPES[0]);
  const [lane, setLane] = useState(LANES[0]);
  const [state, setState] = useState("Nationwide");
  const [loaded, setLoaded] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [previewMessage, setPreviewMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadScope() {
      let saved: any = {};
      try {
        saved = JSON.parse(localStorage.getItem("mh_buyer_scope") || "{}");
      } catch {
        saved = {};
      }
      try {
        const res = await fetch("/api/preferences", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          saved = data?.prefs?.buyerScope || saved;
        }
      } catch {
        /* local fallback is enough */
      }
      if (cancelled) return;
      const savedVehicle = VEHICLE_TYPES.find(
        (item) => item.label === saved.vehicle,
      );
      const savedLane = LANES.find((item) => item.label === saved.lane);
      if (savedVehicle) setVehicle(savedVehicle);
      if (savedLane) setLane(savedLane);
      if (typeof saved.state === "string" && STATES.includes(saved.state))
        setState(saved.state);
      setLoaded(true);
    }
    loadScope();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const buyerScope = { vehicle: vehicle.label, lane: lane.label, state };
    try {
      localStorage.setItem("mh_buyer_scope", JSON.stringify(buyerScope));
    } catch {
      /* ignore */
    }
    const timer = window.setTimeout(() => {
      fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyerScope }),
      }).catch(() => {
        /* guest users still keep local scope */
      });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [vehicle, lane, state, loaded]);

  const scrapePlan = useMemo(
    () =>
      planScrapeForBuyerScope({
        vehicleType: vehicle.q,
        lane: lane.lane,
        state,
        titleType: lane.titleType,
        q: lane.q,
      }),
    [vehicle, lane, state],
  );

  const href = useMemo(() => {
    const params = new URLSearchParams();
    const q = [vehicle.q, lane.q].filter(Boolean).join(" ").trim();
    if (q) params.set("q", q);
    if (lane.lane !== "all") params.set("lane", lane.lane);
    if (lane.titleType) params.set("titleType", lane.titleType);
    if (state !== "Nationwide") params.set("state", state);
    params.set("sort", "profit");
    return `/scan?${params.toString()}`;
  }, [vehicle, lane, state]);

  const previewSmartRun = async () => {
    setPreviewing(true);
    setPreviewMessage(null);
    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: [vehicle.q, lane.q].filter(Boolean).join(" ").trim() || vehicle.q,
          scope: {
            vehicleType: vehicle.q,
            lane: lane.lane,
            state,
            titleType: lane.titleType,
            q: lane.q,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not preview run");
      setPreviewMessage(data?.message || "Smart run preview ready.");
    } catch (error) {
      setPreviewMessage(
        error instanceof Error ? error.message : "Could not preview smart run.",
      );
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <section className="glass-panel p-4 md:p-5 space-y-5">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-[var(--t5)]">
            Build your search
          </p>
          <h2 className="text-xl font-black text-[var(--t1)]">
            Pick what, where, and how you buy
          </h2>
          <p className="mt-1 text-sm text-[var(--t4)]">
            Current scope: {vehicle.label} · {lane.label} · {state}
          </p>
          <p className="mt-1 text-xs text-[var(--t5)]">
            Smart run would touch {scrapePlan.sourceIds.length} source
            {scrapePlan.sourceIds.length === 1 ? "" : "s"}:{" "}
            {scrapePlan.sourceIds.slice(0, 4).join(", ")}
            {scrapePlan.sourceIds.length > 4
              ? `, +${scrapePlan.sourceIds.length - 4} more`
              : ""}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={previewSmartRun}
            disabled={previewing}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)] transition-transform active:scale-[0.98] disabled:opacity-60"
          >
            <Sparkles size={15} />
            {previewing ? "Planning..." : "Preview smart run"}
          </button>
          <Link
            href="/sources"
            className="inline-flex items-center justify-center rounded-[var(--r3)] border border-[var(--b2)] bg-[var(--s0)] px-4 py-2.5 text-sm font-bold text-[var(--t2)]"
          >
            Source setup
          </Link>
          <Link
            href={href}
            className="inline-flex items-center justify-center gap-2 rounded-[var(--r3)] px-4 py-2.5 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Open matching scanner
            <Search size={15} />
          </Link>
        </div>
      </div>

      {previewMessage && (
        <div className="rounded-[var(--r3)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-4 py-3 text-sm font-semibold text-[var(--t2)]">
          {previewMessage}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr_0.8fr]">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <Car size={14} /> Vehicle type
          </div>
          <div className="grid grid-cols-2 gap-2">
            {VEHICLE_TYPES.map((item) => (
              <button
                key={item.label}
                onClick={() => setVehicle(item)}
                className={`rounded-[var(--r2)] border px-3 py-2 text-left transition-colors ${cx(vehicle.label === item.label)}`}
              >
                <div className="text-sm font-bold">{item.label}</div>
                <div className="mt-0.5 text-[11px] opacity-70">{item.hint}</div>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <Gavel size={14} /> Buying lane
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {LANES.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.label}
                  onClick={() => setLane(item)}
                  className={`rounded-[var(--r2)] border px-3 py-2 text-left transition-colors ${cx(lane.label === item.label)}`}
                >
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Icon size={14} />
                    {item.label}
                  </div>
                  <div className="mt-0.5 text-[11px] opacity-70">
                    {item.hint}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-[var(--t4)]">
            <MapPin size={14} /> Market
          </div>
          <div className="flex flex-wrap gap-2">
            {STATES.map((item) => (
              <button
                key={item}
                onClick={() => setState(item)}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${cx(state === item)}`}
              >
                {item}
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--t4)]">
            Start broad, then narrow in Scan with make, model, budget, mileage,
            title, drivetrain, and source.
          </p>
        </div>
      </div>
    </section>
  );
}
