"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Panel } from "@/components/shared/Panel";
import { Tag } from "@/components/shared/Tag";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";
import { ErrorState } from "@/components/shared/ErrorState";
import { InventoryItem } from "@/lib/data/inventory-service";
import { useDealerId } from "@/hooks/useDealerId";

const DAILY_FLOOR_RATE = 35;

function ReconCard({
  item,
  now,
  onUpdated,
}: {
  item: InventoryItem;
  now: number;
  onUpdated: (item: InventoryItem) => void;
}) {
  const [advancing, setAdvancing] = useState(false);

  const rate = item.dailyFloorRate > 0 ? item.dailyFloorRate : DAILY_FLOOR_RATE;
  const floorMs = now - new Date(item.floorDate).getTime();
  const days = Math.max(0, Math.floor(floorMs / 86_400_000));
  const carryNow = days * rate;

  const handleAdvance = useCallback(async () => {
    setAdvancing(true);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, stage: "listed" }),
      });
      const data = await res.json();
      if (data.item) onUpdated(data.item);
    } finally {
      setAdvancing(false);
    }
  }, [item.id, onUpdated]);

  const repairProgress =
    item.repairCost > 0
      ? ((item.reconCost + item.repairCost) / (item.totalCost * 0.2)) * 100
      : 0; // Rough estimate of repair progress relative to 20% of cost

  const progressPct = Math.min(100, Math.max(10, repairProgress));

  return (
    <div className="panel p-5 space-y-4 reveal-on-scroll transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-[15px] leading-tight text-[var(--t1)]">
            {item.year} {item.make} {item.model}
            {item.trim ? (
              <span className="font-normal text-[var(--t4)]">
                {" "}
                · {item.trim}
              </span>
            ) : null}
          </h3>
          <p className="text-xs mt-0.5 font-mono text-[var(--t4)]">
            {item.vin.slice(0, 8)}…{item.vin.slice(-4)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <Tag color="blue">In Repair</Tag>
          <span className="text-[10px] text-[var(--t5)]">
            {days} Days on Lot
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3 rounded-[var(--r3)] bg-[var(--s3)] border border-[var(--b1)]">
        <div className="flex justify-between items-center text-xs text-[var(--t2)] mb-1">
          <span>Repair Progress</span>
          <Mono className="font-bold text-[var(--blue)]">
            {progressPct.toFixed(0)}%
          </Mono>
        </div>
        <div className="relative h-1.5 w-full rounded-full overflow-hidden bg-[var(--s5)]">
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 bg-[var(--blue)] shadow-[0_0_8px_rgba(59,130,246,0.5)]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 pt-2">
        <div>
          <p className="text-[10px] uppercase font-semibold text-[var(--t5)] tracking-widest mb-1">
            Est. Repair Cost
          </p>
          <Mono className="text-sm font-bold text-[var(--t2)]">
            $
            {(item.repairCost || item.totalCost * 0.15).toLocaleString(
              undefined,
              { maximumFractionDigits: 0 },
            )}
          </Mono>
        </div>
        <div>
          <p className="text-[10px] uppercase font-semibold text-[var(--amber)] tracking-widest mb-1">
            Carrying Cost
          </p>
          <Mono className="text-sm font-bold text-[var(--amber)]">
            ${carryNow.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </Mono>
        </div>
      </div>

      <button
        onClick={handleAdvance}
        disabled={advancing}
        className="w-full text-xs font-bold py-2.5 rounded-[var(--r3)] transition-all flex items-center justify-center gap-2 text-white border-none"
        style={{ background: "var(--grad)" }}
      >
        {advancing ? (
          <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
        ) : (
          <>
            Complete Recon & Move to Listed{" "}
            <Ico name="arrow" size={14} className="rotate-90" />
          </>
        )}
      </button>
    </div>
  );
}

export default function ReconPage() {
  const router = useRouter();
  const { dealerId, loading: dealerLoading } = useDealerId();
  const [fleet, setFleet] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (dealerLoading) return;
    if (!dealerId) {
      setError("Please sign in to view recon vehicles.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetch(`/api/inventory?dealerId=${dealerId}&stage=recon&limit=100`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          setFleet([]);
        } else setFleet(data.items || []);
      })
      .catch((e) => {
        setError(e.message);
        setFleet([]);
      })
      .finally(() => setLoading(false));
  }, [dealerId, dealerLoading]);

  const handleUpdated = useCallback((updated: InventoryItem) => {
    // If it's no longer in recon, remove it from the list
    if (updated.stage !== "recon") {
      setFleet((prev) => prev.filter((f) => f.id !== updated.id));
    } else {
      setFleet((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    }
  }, []);

  const stats = useMemo(() => {
    const totalCarry = fleet.reduce((a, f) => {
      const d = Math.max(
        0,
        Math.floor((now - new Date(f.floorDate).getTime()) / 86_400_000),
      );
      const r = f.dailyFloorRate > 0 ? f.dailyFloorRate : DAILY_FLOOR_RATE;
      return a + d * r;
    }, 0);
    const totalRepair = fleet.reduce(
      (a, f) => a + (f.repairCost || 0) + (f.reconCost || 0),
      0,
    );

    return {
      total: fleet.length,
      totalCarry,
      totalRepair,
    };
  }, [fleet, now]);

  return (
    <div className="space-y-5 pb-24 max-w-4xl mx-auto animate-fadeUp">
      {/* Header */}
      <div className="glass-panel p-4 md:p-6 flex items-center gap-3 md:gap-4 mb-6">
        <div
          className="w-10 h-10 md:w-12 md:h-12 rounded-[var(--r3)] flex items-center justify-center text-white"
          style={{ background: "var(--grad)" }}
        >
          <Ico name="settings" size={20} />
        </div>
        <div>
          <h1 className="text-lg md:text-2xl font-bold text-[var(--t1)]">
            Back-Lot Recon Tracker
          </h1>
          <p className="text-xs md:text-sm text-[var(--t4)] mt-0.5">
            Track vehicles in repair, carrying costs, and shop progress.
          </p>
        </div>
      </div>

      {/* Stats */}
      {!loading && !error && fleet.length > 0 && (
        <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
          <Panel padding="sm" className="text-center">
            <p className="text-[10px] uppercase font-semibold text-[var(--t5)] tracking-widest mb-1">
              In Shop
            </p>
            <Mono className="text-2xl font-bold text-[var(--t1)]">
              {stats.total}
            </Mono>
          </Panel>
          <Panel
            padding="sm"
            className="text-center"
            style={{ background: "var(--blo)" }}
          >
            <p className="text-[10px] uppercase font-semibold text-[var(--blue)] tracking-widest mb-1">
              Recon Spend
            </p>
            <Mono className="text-2xl font-bold text-[var(--blue)]">
              ${stats.totalRepair.toLocaleString()}
            </Mono>
          </Panel>
          <Panel
            padding="sm"
            className="text-center"
            style={{ background: "var(--alo)" }}
          >
            <p className="text-[10px] uppercase font-semibold text-[var(--amber)] tracking-widest mb-1">
              Total Carry Bleed
            </p>
            <Mono className="text-2xl font-bold text-[var(--amber)]">
              ${stats.totalCarry.toLocaleString()}
            </Mono>
          </Panel>
        </div>
      )}

      {/* States */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-[var(--coral)] border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {error && !loading && (
        <ErrorState
          title="Couldn't load recon data"
          message={error}
          onRetry={() => window.location.reload()}
        />
      )}

      {!loading && !error && fleet.length === 0 && (
        <Panel className="flex flex-col items-center justify-center py-20 text-center gap-4 bg-[var(--s2)]">
          <div className="w-16 h-16 rounded-[var(--r4)] bg-[var(--s3)] flex items-center justify-center">
            <Ico name="check" size={32} className="text-[var(--t4)]" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-[var(--t1)]">
              Shop is clear!
            </h2>
            <p className="text-sm text-[var(--t3)] mt-1">
              No vehicles currently in recon.
            </p>
          </div>
          <button
            onClick={() => router.push("/fleet")}
            className="mt-2 px-6 py-2.5 rounded-[var(--r3)] text-sm font-bold bg-[var(--blue)] text-white shadow-lg transition-transform hover:-translate-y-0.5"
          >
            View Fleet
          </button>
        </Panel>
      )}

      {/* Grid */}
      {!loading && !error && fleet.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fleet.map((item) => (
            <ReconCard
              key={item.id}
              item={item}
              now={now}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
}
