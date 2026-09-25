"use client";

import React from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { PriceMilesChart } from "@/components/deal/PriceMilesChart";

const fetcher = (url: string) => fetch(url).then((r) => r.json());
const money = (v: any) => `$${(Number(v) || 0).toLocaleString()}`;

export default function OverviewPage() {
  const params = useParams<{ make: string; model: string }>();
  const make = decodeURIComponent(params.make || "");
  const model = decodeURIComponent(params.model || "");
  const { data, isLoading } = useSWR(
    make && model
      ? `/api/market/overview?make=${encodeURIComponent(make)}&model=${encodeURIComponent(model)}`
      : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const stats = data?.stats;
  const trims: any[] = data?.trims ?? [];
  const regional: any[] = data?.regional ?? [];

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-8 space-y-6"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div>
        <h1 className="text-2xl font-black text-[var(--t1)] capitalize">
          {make} {model}
        </h1>
        <p className="text-[var(--t3)] text-sm">
          Market overview · used · nationwide
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-[var(--t3)]">
          Loading market…
        </div>
      ) : !stats ? (
        <div className="glass-panel p-10 text-center text-[var(--t4)]">
          No active inventory for this vehicle.
        </div>
      ) : (
        <>
          {/* Hero stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              {
                label: "GO Deals",
                value: stats.goDeals,
                color: "var(--green)",
              },
              {
                label: "Avg Net Profit",
                value: money(stats.avgProfit),
                color: "var(--green)",
              },
              {
                label: "Total Active",
                value: stats.totalActive,
                color: "var(--t1)",
              },
            ].map((s) => (
              <div key={s.label} className="glass-panel p-4 text-center">
                <Mono
                  className="text-2xl font-black"
                  style={{ fontFamily: "var(--fm)", color: s.color }}
                >
                  {s.value}
                </Mono>
                <p className="text-[11px] text-[var(--t4)] font-semibold mt-0.5">
                  {s.label}
                </p>
              </div>
            ))}
          </div>

          {/* Scatter */}
          {data.scatter?.length >= 6 && (
            <div className="glass-panel p-5">
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-2">
                Price vs mileage
              </p>
              <PriceMilesChart points={data.scatter} trend={null} />
            </div>
          )}

          {/* Profit by trim */}
          {trims.length > 0 && (
            <div className="glass-panel p-0 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--b1)]">
                    <th className="text-left p-3 text-[var(--t4)] text-xs uppercase tracking-wider font-bold">
                      Trim
                    </th>
                    <th className="text-right p-3 text-[var(--t4)] text-xs uppercase tracking-wider font-bold">
                      GO
                    </th>
                    <th className="text-right p-3 text-[var(--t4)] text-xs uppercase tracking-wider font-bold">
                      Avg profit
                    </th>
                    <th className="text-right p-3 text-[var(--t4)] text-xs uppercase tracking-wider font-bold">
                      Avg ask
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {trims.map((t) => (
                    <tr
                      key={t.trim}
                      className="border-b border-[var(--b1)] last:border-0"
                    >
                      <td className="p-3 text-[var(--t2)] font-semibold">
                        {t.trim}
                      </td>
                      <td className="p-3 text-right">
                        <Mono style={{ fontFamily: "var(--fm)" }}>
                          {t.goDeals}
                        </Mono>
                      </td>
                      <td className="p-3 text-right">
                        <Mono
                          className="text-[var(--green)] font-bold"
                          style={{ fontFamily: "var(--fm)" }}
                        >
                          {money(t.avgProfit)}
                        </Mono>
                      </td>
                      <td className="p-3 text-right">
                        <Mono
                          className="text-[var(--t3)]"
                          style={{ fontFamily: "var(--fm)" }}
                        >
                          {money(t.avgAsk)}
                        </Mono>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Regional */}
          {regional.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold mb-2 px-1">
                Most profitable states
              </p>
              <div className="flex flex-wrap gap-2">
                {regional.map((r, i) => (
                  <span
                    key={r.state}
                    className="px-3 py-1.5 rounded-full text-xs font-bold"
                    style={
                      i === 0
                        ? { background: "var(--glo)", color: "var(--green)" }
                        : { background: "var(--s2)", color: "var(--t2)" }
                    }
                  >
                    {r.state} · {money(r.avgProfit)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
