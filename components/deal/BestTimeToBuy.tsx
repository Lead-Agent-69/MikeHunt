"use client";

// Best-time-to-buy seasonality — when this body type is cheapest to acquire, and whether now is a
// good window. Deterministic from well-known used-car seasonality (trucks/SUVs peak in winter;
// convertibles/sports peak in spring/summer). Free, no data call. Dealer-facing acquisition angle.

import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Ico } from "@/components/shared/Ico";

interface Props {
  make?: string | null;
  model?: string | null;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

type Profile = {
  label: string;
  // months (1-12) when ACQUISITION is cheapest (soft demand)
  buy: number[];
  window: string;
  why: string;
};

function profileFor(make?: string | null, model?: string | null): Profile {
  const mm = `${make || ""} ${model || ""}`.toLowerCase();
  const isTruckSuv =
    /\b(silverado|sierra|f-?150|f-?250|f-?350|ram|tundra|tacoma|titan|frontier|ranger|colorado|canyon|tahoe|suburban|yukon|expedition|explorer|wrangler|4runner|highlander|pilot|telluride|palisade|grand ?cherokee|durango|sequoia|bronco|escalade|4x4|4wd|awd|truck|suv|pickup)\b/.test(
      mm,
    );
  const isWarm =
    /\b(convertible|roadster|spyder|cabriolet|corvette|mustang|camaro|challenger|miata|porsche|gt-?r|supra|m3|m4|z4|boxster)\b/.test(
      mm,
    );

  if (isTruckSuv)
    return {
      label: "Truck / SUV",
      buy: [3, 4, 5, 6, 7, 8],
      window: "Mar–Aug",
      why: "This general pattern treats spring and summer as potentially softer-demand months for trucks and SUVs. Regional weather and inventory can change it.",
    };
  if (isWarm)
    return {
      label: "Sports / convertible",
      buy: [10, 11, 12, 1, 2],
      window: "Oct–Feb",
      why: "This general pattern treats colder months as potentially softer-demand periods for sports cars and convertibles. It does not measure this vehicle's market.",
    };
  return {
    label: "Sedan / everyday",
    buy: [11, 12, 1],
    window: "Nov–Jan",
    why: "This general pattern uses year-end inventory clearing as a possible shopping window for everyday vehicles. Compare actual local prices first.",
  };
}

export function BestTimeToBuy({ make, model }: Props) {
  const p = profileFor(make, model);
  const month = new Date().getMonth() + 1; // 1-12
  const goodNow = p.buy.includes(month);

  return (
    <Card
      className="border-none overflow-hidden glass-panel"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <CardContent className="p-6 md:p-7">
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <Ico name="clock" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Seasonal context
          </p>
          <span
            className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black"
            style={{
              background: goodNow ? "var(--glo)" : "var(--amber-lo)",
              color: goodNow ? "var(--green)" : "var(--amber-d)",
            }}
          >
            {goodNow
              ? "Typical softer-demand window"
              : `Typical window: ${p.window}`}
          </span>
        </div>
        <p className="text-sm text-[var(--t3)] mb-2">{p.why}</p>
        <p className="mb-4 text-xs text-[var(--t4)]">
          General seasonal heuristic, not a forecast from local sales. Compare
          current listings, title, condition and total purchase costs before
          acting.
        </p>

        {/* 12-month strip — green = soft (cheaper to acquire) */}
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-12 sm:gap-1">
          {MONTHS.map((m, i) => {
            const mo = i + 1;
            const soft = p.buy.includes(mo);
            const now = mo === month;
            return (
              <div key={m} className="flex-1 text-center">
                <div
                  className="h-7 rounded-md flex items-center justify-center"
                  style={{
                    background: soft ? "var(--glo)" : "var(--s2)",
                    border: now ? "1.5px solid var(--amber)" : "none",
                  }}
                  title={`${m}: ${soft ? "typical softer-demand window" : "outside typical window"}${now ? " (current month)" : ""}`}
                >
                  {now && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--amber)" }}
                    />
                  )}
                </div>
                <span className="text-[8px] text-[var(--t5)] mt-0.5 block">
                  {m}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
