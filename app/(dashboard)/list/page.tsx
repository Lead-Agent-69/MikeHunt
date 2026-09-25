"use client";

import { useState } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr-config";
import { Btn } from "@/components/shared/Btn";
import { Tag } from "@/components/shared/Tag";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { useDealerId } from "@/hooks/useDealerId";

const PLATFORMS = [
  { id: "fb", name: "Facebook Marketplace", active: true },
  { id: "at", name: "AutoTrader", active: true },
  { id: "cg", name: "CarGurus", active: false },
  { id: "cars", name: "Cars.com", active: false },
  { id: "cl", name: "Craigslist", active: true },
];

export default function ListPage() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    "fb",
    "at",
    "cl",
  ]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [blasting, setBlasting] = useState(false);
  const [done, setDone] = useState(false);

  const { dealerId, loading: authLoading } = useDealerId();

  const {
    data,
    error: swrError,
    isLoading: isSwrLoading,
    mutate,
  } = useSWR(
    dealerId
      ? `/api/inventory?dealerId=${dealerId}&stage=listed&limit=100`
      : null,
    fetcher,
    { refreshInterval: 180000 },
  );

  const loading = authLoading || isSwrLoading;
  const error =
    swrError?.message ||
    data?.error ||
    (!dealerId && !authLoading ? "Not authenticated" : null);
  const inventory: InventoryItem[] = data?.items || [];

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

  const toggleVehicle = (id: string) => {
    setSelectedVehicles((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  };

  const handleBlast = async () => {
    if (selectedVehicles.length === 0) return;
    setBlasting(true);
    setDone(false);
    try {
      const platformNames = selectedPlatforms.map((p) => {
        const map: Record<string, string> = {
          fb: "facebook",
          at: "autotrader",
          cl: "craigslist",
          cars: "cars.com",
          cg: "cargurus",
        };
        return map[p] || p;
      });
      await Promise.all(
        selectedVehicles.map(async (id) => {
          await fetch("/api/inventory", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id,
              stage: "listed",
              listed_platforms: platformNames,
            }),
          });
        }),
      );
    } finally {
      setBlasting(false);
      setDone(true);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto animate-fadeUp">
      <div className="glass-panel p-6 flex items-center gap-4">
        <div
          className="w-12 h-12 rounded-[var(--r3)] flex items-center justify-center text-white"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="list" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-[var(--t1)]">
            Listing Manager
          </h1>
          <p className="text-sm text-[var(--t4)] mt-1">
            Mark inventory as listed and track which marketplaces each vehicle
            is posted on.
          </p>
        </div>
      </div>

      {loading && (
        <div className="glass-panel text-center py-20 flex flex-col items-center animate-pulse">
          <div
            className="w-12 h-12 rounded-full opacity-20 animate-ping absolute"
            style={{ background: "var(--coral)" }}
          ></div>
          <Ico
            name="refresh"
            className="animate-spin mb-4 relative z-10 text-[var(--coral)]"
            size={32}
          />
          <p className="text-[var(--t4)] font-medium">Loading listings...</p>
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Couldn't load listings"
          message={error}
          onRetry={() => mutate()}
        />
      )}

      {!loading && !error && (
        <div className="glass-panel p-6 animate-popIn">
          <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-4">
            1. Select Vehicles to List
          </h2>
          {inventory.length === 0 ? (
            <p className="text-sm text-[var(--t3)] font-medium">
              No listed vehicles available. Advance inventory stage to "listed"
              in Fleet first.
            </p>
          ) : (
            <div className="space-y-3">
              {inventory.map((vehicle) => (
                <button
                  key={vehicle.id}
                  onClick={() => toggleVehicle(vehicle.id)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-none transition-all text-left group ${
                    selectedVehicles.includes(vehicle.id)
                      ? ""
                      : "hover:-translate-y-0.5"
                  }`}
                  style={
                    selectedVehicles.includes(vehicle.id)
                      ? { background: "var(--blo)" }
                      : { background: "var(--s2)" }
                  }
                >
                  <span className="text-sm font-bold text-[var(--t1)] group-hover:text-[var(--blue)] transition-colors">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </span>
                  <span className="text-sm font-bold text-[var(--blue)]">
                    ${(vehicle.listPrice || vehicle.totalCost).toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        className="glass-panel p-6 animate-popIn"
        style={{ animationDelay: "100ms" }}
      >
        <h2 className="text-sm font-black text-[var(--t4)] uppercase tracking-widest mb-4">
          2. Select Platforms
        </h2>
        <div className="space-y-3">
          {PLATFORMS.map((platform) => (
            <button
              key={platform.id}
              disabled={!platform.active}
              onClick={() => togglePlatform(platform.id)}
              className={`w-full flex items-center justify-between p-4 rounded-xl border-none transition-all text-left disabled:opacity-40 disabled:cursor-not-allowed group ${
                selectedPlatforms.includes(platform.id)
                  ? ""
                  : "hover:-translate-y-0.5"
              }`}
              style={
                selectedPlatforms.includes(platform.id)
                  ? { background: "var(--blo)" }
                  : { background: "var(--s2)" }
              }
            >
              <span className="text-sm font-bold text-[var(--t1)]">
                {platform.name}
              </span>
              {platform.active ? (
                selectedPlatforms.includes(platform.id) ? (
                  <Tag color="blue" className="shadow-sm">
                    Selected
                  </Tag>
                ) : null
              ) : (
                <Tag color="red">Unsupported</Tag>
              )}
            </button>
          ))}
        </div>
      </div>

      <button
        disabled={
          selectedVehicles.length === 0 ||
          selectedPlatforms.length === 0 ||
          blasting
        }
        className="w-full text-sm font-bold text-white py-4 rounded-xl border-none transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed"
        style={{ background: "var(--grad)" }}
        onClick={handleBlast}
      >
        {blasting && <Ico name="refresh" className="animate-spin" />}
        {done ? "Listing Updated" : "Mark as Listed"}
      </button>

      {done && (
        <div
          className="glass-panel text-center py-6 animate-popIn"
          style={{ background: "var(--glo)" }}
        >
          <p className="text-[var(--green)] font-bold flex justify-center items-center gap-2">
            <Ico name="check" /> Tagged {selectedVehicles.length}{" "}
            {selectedVehicles.length === 1 ? "vehicle" : "vehicles"} as listed
            on {selectedPlatforms.length}{" "}
            {selectedPlatforms.length === 1 ? "platform" : "platforms"}.
          </p>
        </div>
      )}
    </div>
  );
}
