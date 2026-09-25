"use client";

import { Suspense, useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { Ico } from "@/components/shared/Ico";
import { Mono } from "@/components/shared/Mono";
import { SelectField } from "@/components/shared/Field";
import { US_STATES, getTitleRules } from "@/lib/utils/titleRules";
import { cn } from "@/lib/utils";
import { useDealerId } from "@/hooks/useDealerId";
import { Skeleton } from "@/components/shared/Skeleton";

interface QuoteResult {
  from: string;
  to: string;
  miles: number;
  minutes?: number;
  driveTime?: string;
  mode?: "road" | "estimate";
  quote: number;
  openQuote?: number;
  enclosedQuote?: number;
}

const CARRIER_TIERS = [
  {
    id: "diy",
    label: "Self-Drive / Driveaway",
    icon: "map",
    color: "var(--green)",
    multiplier: 0.18, // fuel + time cost
    desc: "You or hired driver delivers it. Cheapest option, most time.",
    eta: "1–3 days",
  },
  {
    id: "open",
    label: "Open Carrier",
    icon: "truck",
    color: "var(--amber)",
    multiplier: 0.78,
    desc: "Standard open transport. Most common method for non-luxury vehicles.",
    eta: "3–7 days",
  },
  {
    id: "enclosed",
    label: "Enclosed Carrier",
    icon: "package",
    color: "var(--blue)",
    multiplier: 1.35,
    desc: "Fully protected transport. Recommended for high-value or damaged vehicles.",
    eta: "5–10 days",
  },
];

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

function MovePageInner() {
  const { dealerId, loading: dealerLoading } = useDealerId();
  const searchParams = useSearchParams();

  // Prefill origin from deal context (e.g. /move?from=TX&dealId=...)
  const fromParam = (searchParams.get("from") || "").toUpperCase();
  const dealId = searchParams.get("dealId");
  const initialFrom = US_STATES.includes(fromParam) ? fromParam : "TX";

  const [fromState, setFromState] = useState(initialFrom);
  const [toState, setToState] = useState("CA");

  // Use SWR for data fetching
  const { data, error, isLoading } = useSWR(
    dealerId && !dealerLoading
      ? `/api/transport/quote?from=${fromState}&to=${toState}&dealerId=${dealerId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 300000, // 5 minutes (quotes don't change often)
    },
  );

  const loading = isLoading || dealerLoading;
  const authError =
    !dealerLoading && !dealerId
      ? "Please sign in to view transport quotes."
      : null;

  // Calculate quotes from data
  const result = useMemo(() => {
    if (!data) return null;
    return {
      ...data,
      openQuote: Math.round(data.miles * 0.78) + 50,
      enclosedQuote: Math.round(data.miles * 1.35) + 50,
    };
  }, [data]);

  const titleRules = getTitleRules(fromState, toState);
  const isSameState = fromState === toState;

  return (
    <div
      className="space-y-4 md:space-y-5 max-w-3xl mx-auto pb-24 md:pb-6"
      style={{ animation: "fadeUp 200ms ease-out both" }}
    >
      {/* Header */}
      <div
        className="glass-panel p-4 md:p-5 flex items-center gap-3 md:gap-4"
        style={{
          borderColor: "rgba(255,56,92,0.15)",
          backgroundColor: "rgba(255,56,92,0.04)",
        }}
      >
        <div
          className="w-10 h-10 md:w-11 md:h-11 rounded-[var(--r3)] flex items-center justify-center text-white flex-shrink-0"
          style={{
            background: "var(--amber)",
            boxShadow: "0 0 20px rgba(255,56,92,0.3)",
          }}
        >
          <Ico name="truck" size={18} />
        </div>
        <div>
          <h1 className="text-lg md:text-xl font-black text-[var(--t1)]">
            Move & Logistics
          </h1>
          <p className="text-xs md:text-sm text-[var(--t3)] mt-0.5">
            {dealId ? (
              <>
                Transport options for your deal — origin prefilled from{" "}
                {fromState}.
              </>
            ) : (
              <>
                Instant transport quotes + title route check for any
                state-to-state move.
              </>
            )}
          </p>
        </div>
      </div>

      {/* Route Selector */}
      <div className="glass-panel p-5">
        <h2 className="text-[11px] font-black text-[var(--t4)] uppercase tracking-widest mb-4">
          Route
        </h2>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <SelectField
              label="From State"
              options={US_STATES.map((s) => ({ value: s, label: s }))}
              value={fromState}
              onChange={(e) => setFromState(e.target.value)}
            />
          </div>
          <button
            onClick={() => {
              setFromState(toState);
              setToState(fromState);
            }}
            className="mt-5 h-10 w-10 flex-shrink-0 rounded-full flex items-center justify-center transition-all hover:scale-110 hover:rotate-180"
            style={{ background: "var(--s2)", border: "1px solid var(--b2)" }}
            title="Swap states"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--t3)]"
            >
              <path d="M8 3 4 7l4 4" />
              <path d="M4 7h16" />
              <path d="m16 21 4-4-4-4" />
              <path d="M20 17H4" />
            </svg>
          </button>
          <div className="flex-1">
            <SelectField
              label="To State"
              options={US_STATES.map((s) => ({ value: s, label: s }))}
              value={toState}
              onChange={(e) => setToState(e.target.value)}
            />
          </div>
        </div>

        {/* Distance badge */}
        {result && !isSameState && (
          <div
            className="mt-4 flex items-center gap-2 text-sm text-[var(--t3)]"
            style={{ animation: "fadeUp 150ms ease-out both" }}
          >
            <Ico name="map" size={14} className="text-[var(--t4)]" />
            <span>
              <Mono className="font-bold text-[var(--t1)]">
                {result.miles.toLocaleString()}
              </Mono>{" "}
              driving miles
              {result.driveTime ? (
                <>
                  {" · "}
                  <Mono className="font-bold text-[var(--t1)]">
                    {result.driveTime}
                  </Mono>{" "}
                  drive
                </>
              ) : null}{" "}
              · {fromState} → {toState}
              {result.mode === "road" ? (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--green)] font-bold">
                  ● live route
                </span>
              ) : null}
            </span>
          </div>
        )}
        {isSameState && (
          <p className="mt-3 text-sm text-[var(--t4)]">
            Same state — local tow/driveaway only.
          </p>
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="glass-panel p-8 flex items-center justify-center gap-3">
          <div
            className="w-5 h-5 rounded-full border-2 border-[var(--amber)] border-t-transparent"
            style={{ animation: "spin 700ms linear infinite" }}
          />
          <span className="text-sm text-[var(--t3)] font-medium">
            Calculating route…
          </span>
        </div>
      )}

      {/* Error */}
      {(authError || error) && !loading && (
        <div
          className="glass-panel p-5 text-center"
          style={{
            borderColor: "rgba(220,38,38,0.2)",
            backgroundColor: "rgba(220,38,38,0.05)",
          }}
        >
          <p className="text-[var(--red)] text-sm font-bold">
            {authError || error?.message || "An error occurred"}
          </p>
        </div>
      )}

      {/* Carrier Tiers */}
      {result && !loading && !error && (
        <div style={{ animation: "fadeUp 180ms ease-out both" }}>
          <h2 className="text-[11px] font-black text-[var(--t4)] uppercase tracking-widest mb-3 px-1">
            Transport Options
          </h2>
          <div className="space-y-3">
            {CARRIER_TIERS.map((tier, i) => {
              const tierQuote = isSameState
                ? 150
                : Math.max(
                    150,
                    Math.round(result.miles * tier.multiplier) + 50,
                  );
              return (
                <div
                  key={tier.id}
                  className="glass-panel p-5 flex items-center gap-4"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    animation: "fadeUp 200ms ease-out both",
                  }}
                >
                  <div
                    className="w-10 h-10 rounded-[var(--r2)] flex items-center justify-center flex-shrink-0"
                    style={{
                      background: `${tier.color}18`,
                      border: `1px solid ${tier.color}30`,
                    }}
                  >
                    <span style={{ color: tier.color }}>
                      <Ico
                        name={
                          tier.id === "diy"
                            ? "map"
                            : tier.id === "open"
                              ? "truck"
                              : "deal"
                        }
                        size={18}
                      />
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[var(--t1)] text-sm">
                      {tier.label}
                    </p>
                    <p className="text-xs text-[var(--t4)] mt-0.5 leading-relaxed">
                      {tier.desc}
                    </p>
                    <p className="text-xs text-[var(--t4)] mt-1">
                      ETA: {tier.eta}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span
                      className="font-mono text-xl font-black"
                      style={{ color: tier.color }}
                    >
                      ${tierQuote.toLocaleString()}
                    </span>
                    <p className="text-[10px] text-[var(--t5)] mt-0.5">
                      estimate
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[var(--t5)] mt-3 px-1">
            Estimates based on $0.78/mile open carrier industry average. Get
            carrier quotes on{" "}
            <a
              href="https://uship.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--amber)]"
            >
              uShip.com
            </a>{" "}
            or{" "}
            <a
              href="https://montanaweg.com"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-[var(--amber)]"
            >
              MontanaWeg
            </a>
            .
          </p>
        </div>
      )}

      {/* Title Rules */}
      {result && !loading && !error && (
        <div style={{ animation: "fadeUp 220ms ease-out both" }}>
          <h2 className="text-[11px] font-black text-[var(--t4)] uppercase tracking-widest mb-3 px-1">
            Title Route: {fromState} → {toState}
          </h2>
          <div
            className="glass-panel p-5"
            style={
              titleRules.warning
                ? {
                    borderColor: "rgba(220,38,38,0.25)",
                    backgroundColor: "rgba(220,38,38,0.04)",
                  }
                : {
                    borderColor: "rgba(5,150,105,0.2)",
                    backgroundColor: "rgba(5,150,105,0.03)",
                  }
            }
          >
            <div className="flex items-start gap-3 mb-4">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: titleRules.warning
                    ? "rgba(220,38,38,0.12)"
                    : "rgba(5,150,105,0.12)",
                  border: `1px solid ${titleRules.warning ? "rgba(220,38,38,0.25)" : "rgba(5,150,105,0.25)"}`,
                }}
              >
                <span
                  style={{
                    color: titleRules.warning ? "var(--red)" : "var(--green)",
                  }}
                >
                  <Ico
                    name={
                      titleRules.warning ? "alert-triangle" : "check-circle"
                    }
                    size={16}
                  />
                </span>
              </div>
              <div>
                <p
                  className="text-sm font-bold mb-1"
                  style={{
                    color: titleRules.warning ? "var(--red)" : "var(--green)",
                  }}
                >
                  {titleRules.warning ? "⚠ Title Warning" : "✓ Clean Transfer"}
                </p>
                <p className="text-sm text-[var(--t3)] leading-relaxed">
                  {titleRules.note}
                </p>
              </div>
            </div>

            <div className="border-t border-[var(--b1)] pt-4">
              <p className="text-[11px] font-black text-[var(--t4)] uppercase tracking-widest mb-3">
                Required Documents
              </p>
              <ul className="space-y-2">
                {titleRules.requirements.map((req, idx) => (
                  <li
                    key={idx}
                    className="flex items-start gap-2 text-sm text-[var(--t2)]"
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: "rgba(5,150,105,0.1)" }}
                    >
                      <svg
                        className="w-3 h-3 text-[var(--green)]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </div>
                    {req}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Pro tip */}
      <div
        className="glass-panel p-4 flex items-start gap-3"
        style={{ animation: "fadeUp 250ms ease-out both" }}
      >
        <svg
          className="w-4 h-4 text-[var(--amber)] mt-0.5 flex-shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <path d="M9 18h6" />
          <path d="M10 22h4" />
        </svg>
        <p className="text-xs text-[var(--t3)] leading-relaxed">
          <strong className="text-[var(--t2)]">Pro tip:</strong> Transport costs
          are already included in the Deal Analyzer profit calculation. These
          quotes help you verify the auto-estimate or book a carrier for a
          specific unit.
        </p>
      </div>
    </div>
  );
}

export default function MovePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-3xl mx-auto pb-24 md:pb-6 space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      }
    >
      <MovePageInner />
    </Suspense>
  );
}
