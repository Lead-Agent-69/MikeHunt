"use client";

import useSWR from "swr";
import Link from "next/link";
import { Mono } from "@/components/shared/Mono";
import { Ico } from "@/components/shared/Ico";
import { useCountUp } from "@/hooks/useCountUp";

// The money, the instant the app opens. A count-up of total profit on the table + the single best
// flip right now. This is what makes the masterpiece VISIBLE — the value hits before you scroll.
const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

export function DiscoverHero({ state }: { state?: string }) {
  const { data } = useSWR(
    `/api/discover/hero${state ? `?state=${state}` : ""}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const total = useCountUp(data?.totalProfit || 0);
  if (!data || !data.goCount) return null;

  const top = data.top;
  return (
    <div
      className="relative overflow-hidden rounded-[var(--r3)] p-6 md:p-8"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow3)" }}
    >
      {/* ambient money glow */}
      <div
        className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full opacity-20 blur-[60px]"
        style={{ background: "var(--green)" }}
      />
      <div
        className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full opacity-10 blur-[50px]"
        style={{ background: "var(--grad)" }}
      />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        {/* Money on the table */}
        <div>
          <p className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--t4)]">
            <Ico name="trending-up" size={14} className="text-[var(--green)]" />
            Profit on the table {state ? `· ${state}` : "· nationwide"}
          </p>
          <Mono
            className="block text-5xl font-black leading-none text-transparent bg-clip-text md:text-6xl"
            style={{
              fontFamily: "var(--fm)",
              backgroundImage:
                "linear-gradient(100deg, var(--green), #86efac 60%, var(--green))",
            }}
          >
            {money(total)}
          </Mono>
          <p className="mt-2.5 text-sm font-semibold text-[var(--t3)]">
            across{" "}
            <span className="font-black text-[var(--t1)]">
              {data.goCount.toLocaleString()}
            </span>{" "}
            BUY deals live right now
          </p>
        </div>

        {/* Today's best flip */}
        {top && (
          <Link
            href={`/deal/${top.id}`}
            className="group block w-full shrink-0 rounded-[var(--r2)] p-4 transition-transform hover:-translate-y-0.5 lg:w-[340px]"
            style={{ background: "var(--s1)", boxShadow: "var(--shadow2)" }}
          >
            <p className="mb-1.5 text-[10px] font-bold uppercase tracking-widest text-[var(--t4)]">
              Today&apos;s best flip
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-[var(--t1)]">
                  {top.name}
                </p>
                <p className="text-xs text-[var(--t4)]">
                  {top.state ? `${top.state} · ` : ""}
                  pay up to{" "}
                  <Mono className="font-bold text-[var(--t2)]">
                    {money(top.maxBid || top.ask)}
                  </Mono>
                </p>
              </div>
              <div
                className="shrink-0 rounded-lg px-2.5 py-1.5 text-right"
                style={{ background: "var(--glo)" }}
              >
                <Mono className="block text-lg font-black leading-none text-[var(--green)]">
                  +{money(top.profit)}
                </Mono>
                <span className="text-[9px] font-bold uppercase tracking-wide text-[var(--green)]">
                  profit
                </span>
              </div>
            </div>
            <p className="mt-2.5 flex items-center justify-end gap-1 text-xs font-bold text-[var(--amber)] opacity-0 transition-opacity group-hover:opacity-100">
              View deal <span aria-hidden>→</span>
            </p>
          </Link>
        )}
      </div>
    </div>
  );
}
