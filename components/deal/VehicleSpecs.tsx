"use client";

import React from "react";
import useSWR from "swr";
import { Mono } from "@/components/shared/Mono";
import { isValidVin } from "@/lib/vehicle/vin";
import { WindowStickerButton } from "./WindowStickerButton";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function Stars({ n }: { n: number }) {
  return (
    <span style={{ color: "var(--amber)", letterSpacing: "1px" }}>
      {"★".repeat(n)}
      <span style={{ color: "var(--b3)" }}>{"★".repeat(5 - n)}</span>
    </span>
  );
}

/** Modern vehicle-intelligence panel — free NHTSA (specs, crash stars, recalls) + EPA MPG. Hides w/o VIN. */
export function VehicleSpecs({
  vin,
  make,
}: {
  vin?: string | null;
  make?: string | null;
}) {
  const valid = vin && isValidVin(vin);
  const { data } = useSWR(valid ? `/api/vin/${vin}/specs` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 600_000,
  });
  if (!valid || !data || data.error) return null;

  const specs = [
    { label: "Body", value: data.bodyClass },
    {
      label: "Engine",
      value:
        data.displacementL || data.cylinders
          ? `${data.displacementL ? `${data.displacementL}L` : ""}${data.cylinders ? ` ${data.cylinders}-cyl` : ""}`.trim()
          : null,
    },
    { label: "Drivetrain", value: data.driveType },
    { label: "Trim", value: data.trim },
    {
      label: "Assembly",
      value: data.plantCountry
        ? `${data.plantCountry}${data.madeInUsa ? " 🇺🇸" : ""}`
        : null,
    },
  ].filter((s) => s.value);

  const mpg = data.mpg;
  const safety = data.safety;
  const hasHighlights = mpg || safety || data.recalls != null;
  if (!hasHighlights && specs.length === 0) return null;

  return (
    <div className="glass-panel p-5 mt-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--t4)] font-bold">
          Vehicle Intelligence · NHTSA + EPA
        </p>
        <WindowStickerButton vin={vin} make={make} />
      </div>

      {/* Highlight metrics */}
      {hasHighlights && (
        <div className="grid grid-cols-3 gap-3">
          {/* Fuel economy */}
          <div
            className="rounded-[var(--r3)] p-3 text-center"
            style={{ background: "var(--s2)" }}
          >
            {mpg?.combined ? (
              <>
                <Mono
                  className="text-2xl font-black text-[var(--t1)]"
                  style={{ fontFamily: "var(--fm)" }}
                >
                  {mpg.combined}
                </Mono>
                <p className="text-[10px] text-[var(--t4)] font-semibold">
                  MPG combined
                </p>
                {(mpg.city || mpg.highway) && (
                  <p className="text-[10px] text-[var(--t5)] mt-0.5">
                    {mpg.city ?? "–"} city · {mpg.highway ?? "–"} hwy
                  </p>
                )}
              </>
            ) : (
              <p className="text-[11px] text-[var(--t5)] pt-2">MPG n/a</p>
            )}
          </div>

          {/* Safety */}
          <div
            className="rounded-[var(--r3)] p-3 text-center"
            style={{ background: "var(--s2)" }}
          >
            {safety?.overall ? (
              <>
                <div className="text-lg leading-none mt-1">
                  <Stars n={safety.overall} />
                </div>
                <p className="text-[10px] text-[var(--t4)] font-semibold mt-1">
                  NHTSA safety
                </p>
                <p className="text-[10px] text-[var(--t5)] mt-0.5">
                  crash-test overall
                </p>
              </>
            ) : (
              <p className="text-[11px] text-[var(--t5)] pt-2">Safety n/a</p>
            )}
          </div>

          {/* Recalls */}
          <div
            className="rounded-[var(--r3)] p-3 text-center"
            style={{
              background: data.recalls > 0 ? "var(--amber-lo)" : "var(--glo)",
            }}
          >
            {data.recalls != null ? (
              <>
                <Mono
                  className="text-2xl font-black"
                  style={{
                    fontFamily: "var(--fm)",
                    color: data.recalls > 0 ? "var(--amber-d)" : "var(--green)",
                  }}
                >
                  {data.recalls}
                </Mono>
                <p className="text-[10px] text-[var(--t4)] font-semibold">
                  open recalls
                </p>
                <p className="text-[10px] text-[var(--t5)] mt-0.5">
                  {data.recalls > 0 ? "leverage" : "all clear"}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-[var(--t5)] pt-2">Recalls n/a</p>
            )}
          </div>
        </div>
      )}

      {/* Safety detail */}
      {safety && (safety.frontal || safety.side || safety.rollover) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--t4)]">
          {safety.frontal && (
            <span>
              Frontal <Stars n={safety.frontal} />
            </span>
          )}
          {safety.side && (
            <span>
              Side <Stars n={safety.side} />
            </span>
          )}
          {safety.rollover && (
            <span>
              Rollover <Stars n={safety.rollover} />
            </span>
          )}
        </div>
      )}

      {/* Spec grid */}
      {specs.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-1 border-t border-[var(--b1)]">
          {specs.map((s) => (
            <div key={s.label}>
              <p className="text-[10px] text-[var(--t4)] font-semibold uppercase tracking-wide">
                {s.label}
              </p>
              <p className="text-sm text-[var(--t1)] font-medium">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {data.recalls > 0 && (
        <p className="text-[11px] text-[var(--t4)]">
          Open recalls are free negotiation leverage — and can be fixed at no
          cost before resale.
        </p>
      )}
    </div>
  );
}
