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
      why: "4x4 demand (and prices) peak in winter — acquire in spring/summer when they soften.",
    };
  if (isWarm)
    return {
      label: "Sports / convertible",
      buy: [10, 11, 12, 1, 2],
      window: "Oct–Feb",
      why: "Top-down demand peaks in spring/summer — acquire in the cold months when sellers cut prices.",
    };
  return {
    label: "Sedan / everyday",
    buy: [11, 12, 1],
    window: "Nov–Jan",
    why: "Mild seasonality — best deals cluster around year-end inventory clearing.",
  };
}

export function BestTimeToBuy({ make, model }: Props) {
  const p = profileFor(make, model);
  const month = new Date().getMonth() + 1; // 1-12
  const goodNow = p.buy.includes(month);

  return (
    <Card
      className="border-none overflow-hidden glass-panel"
      style={{ background: "rgba(20,10,20,0.6)", boxShadow: "var(--shadow)" }}
    >
      <CardContent className="p-6 md:p-7">
        <div className="flex items-center gap-2 mb-1">
          <Ico name="clock" size={15} className="text-[var(--t4)]" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            Best time to buy
          </p>
          <span
            className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-black"
            style={{
              background: goodNow ? "var(--glo)" : "var(--amber-lo)",
              color: goodNow ? "var(--green)" : "var(--amber-d)",
            }}
          >
            {goodNow ? "Good time now" : `Better in ${p.window}`}
          </span>
        </div>
        <p className="text-sm text-[var(--t3)] mb-4">{p.why}</p>

        {/* 12-month strip — green = soft (cheaper to acquire) */}
        <div className="flex gap-1">
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
                  title={soft ? `${m}: softer prices` : `${m}: firmer prices`}
                >
                  {now && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: "var(--amber)" }}
                    />
                  )}
                </div>
                <span className="text-[8px] text-[var(--t5)] mt-0.5 block">
                  {m[0]}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
