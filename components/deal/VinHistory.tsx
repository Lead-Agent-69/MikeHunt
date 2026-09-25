"use client";

import React from "react";
import useSWR from "swr";
import { Card, CardContent } from "@/components/ui/card";
import { Ico } from "@/components/shared/Ico";
import {
  historyFromText,
  type VinHistory as VinHistoryT,
} from "@/lib/vehicle/vin-history";
import { CarfaxLink } from "./CarfaxLink";

// VIN history — the "should I buy" red flags. Tier 1 (free) from the listing text shows instantly;
// if an NMVTIS key is configured, the authoritative report upgrades it. Always shows something.
const fetcher = (u: string) => fetch(u).then((r) => r.json());

export function VinHistory({
  vin,
  title,
  condition,
  damageType,
}: {
  vin?: string | null;
  title?: string | null;
  condition?: string | null;
  damageType?: string | null;
}) {
  // Tier 1 — instant, free, from text we already have.
  const local = React.useMemo(
    () => historyFromText({ title, condition, damageType }),
    [title, condition, damageType],
  );
  // Server tiers — our VIN graph (free, unique) + NMVTIS (authoritative, key-gated).
  const { data } = useSWR(
    vin && vin.length === 17 ? `/api/vin/${vin}/history` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const route: VinHistoryT | null =
    data && data.source && data.source !== "none"
      ? (data as VinHistoryT)
      : null;
  // The raw cross-market sighting timeline (where/when we've seen this exact VIN).
  const sightings: any[] = (data as any)?.sightings || [];
  const multiSighting = sightings.length >= 2;

  // Merge all tiers: NMVTIS/graph red flags + the local listing-text flags & claims.
  const h: VinHistoryT = {
    source: route?.authoritative
      ? "nmvtis"
      : route
        ? "vin-graph"
        : local.source,
    authoritative: !!route?.authoritative,
    titleBrands: Array.from(
      new Set([...(route?.titleBrands || []), ...local.titleBrands]),
    ),
    cleanClaims: route?.authoritative ? route.cleanClaims : local.cleanClaims,
    owners: route?.owners ?? local.owners,
    note: route?.note || local.note,
  };

  const hasFlags = h.titleBrands.length > 0;
  const validVin = !!vin && /^[A-HJ-NPR-Z0-9]{11,17}$/i.test(vin.trim());
  // Show when we have something meaningful — flags, claims, an authoritative all-clear, a multi-sighting
  // timeline (seeing the same VIN twice is a story no single-site report has), OR simply a valid VIN (so the
  // buyer always has the one-tap CarFax pull on a title-branded market).
  if (
    !hasFlags &&
    h.cleanClaims.length === 0 &&
    !h.authoritative &&
    !multiSighting &&
    !validVin
  )
    return null;

  return (
    <Card
      className="border-none"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow)" }}
    >
      <div
        className="h-1 w-full"
        style={{ background: hasFlags ? "var(--red)" : "var(--green)" }}
      />
      <CardContent className="p-6">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
            VIN history
          </p>
          <div className="flex items-center gap-3">
            <CarfaxLink vin={vin} />
            <span className="text-[10px] text-[var(--t5)]">
              {h.authoritative
                ? "NMVTIS · verified"
                : h.source === "vin-graph"
                  ? "our records · cross-referenced"
                  : "from listing · claimed"}
            </span>
          </div>
        </div>

        {hasFlags ? (
          <div className="flex flex-wrap gap-2 mb-3">
            {h.titleBrands.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-white px-2.5 py-1 rounded-md"
                style={{ background: "var(--red)" }}
              >
                <Ico name="alert-triangle" size={13} />
                {b}
              </span>
            ))}
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-md mb-3"
            style={{ background: "var(--glo)", color: "var(--green)" }}
          >
            <Ico name="check-circle" size={15} />
            {h.authoritative
              ? "No title brands on record"
              : "No red flags disclosed"}
          </div>
        )}

        {h.cleanClaims.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
            {h.cleanClaims.map((c) => (
              <span key={c} className="text-xs text-[var(--t3)] font-semibold">
                ✓ {c}
              </span>
            ))}
          </div>
        )}

        <p className="text-[11px] text-[var(--t4)] leading-relaxed">{h.note}</p>

        {/* Cross-market sighting timeline — where & when we've seen THIS VIN. The moat made tangible. */}
        {multiSighting && (
          <div className="mt-4 border-t border-[var(--s2)] pt-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-[var(--t4)]">
              Sighting timeline · seen {sightings.length}× across our market
              scans
            </p>
            <div className="flex flex-col gap-2">
              {sightings.map((s, i) => {
                const branded =
                  /salvage|rebuilt|flood|fire|junk|parts|wreck/.test(
                    (s.condition || "").toLowerCase(),
                  );
                return (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background: branded ? "var(--red)" : "var(--t5)",
                      }}
                    />
                    <span className="w-[68px] shrink-0 text-[var(--t4)]">
                      {s.date ? new Date(s.date).toLocaleDateString() : "—"}
                    </span>
                    <span className="font-bold text-[var(--t2)]">
                      {s.source}
                    </span>
                    {s.state && (
                      <span className="text-[var(--t4)]">{s.state}</span>
                    )}
                    {s.condition && (
                      <span
                        style={{ color: branded ? "var(--red)" : "var(--t3)" }}
                      >
                        {s.condition}
                      </span>
                    )}
                    {s.mileage > 0 && (
                      <span className="font-mono text-[var(--t4)]">
                        {Number(s.mileage).toLocaleString()}mi
                      </span>
                    )}
                    {s.askPrice > 0 && (
                      <span className="ml-auto font-mono text-[var(--t3)]">
                        ${Number(s.askPrice).toLocaleString()}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
