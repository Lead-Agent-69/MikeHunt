"use client";

import useSWR from "swr";
import Link from "next/link";

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const money = (n: number) => `$${Math.round(n).toLocaleString()}`;

type Featured = {
  id: string;
  year?: number | null;
  make?: string | null;
  model?: string | null;
  ask?: number | null;
  city?: string | null;
  state?: string | null;
  source?: string | null;
};

export function DiscoverHero({ state }: { state?: string }) {
  const place = state || "Nationwide";
  const { data } = useSWR<{
    listingCount?: number;
    featured?: Featured | null;
  }>(`/api/discover/hero${state ? `?state=${state}` : ""}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60_000,
  });
  const count = Number(data?.listingCount || 0);
  if (!data || count <= 0) return null;
  const top = data.featured;
  const name = [top?.year, top?.make, top?.model].filter(Boolean).join(" ");

  return (
    <div
      className="relative overflow-hidden rounded-[var(--r3)] p-6 md:p-8"
      style={{ background: "var(--s0)", boxShadow: "var(--shadow3)" }}
    >
      <p className="text-sm font-semibold text-[var(--t2)]">
        <span className="font-black text-[var(--t1)]">
          {count.toLocaleString()}
        </span>{" "}
        listings with an asking price in {place}. This is not money you can
        make.
      </p>
      {top?.id && name ? (
        <Link
          href={`/deal/${top.id}`}
          className="mt-4 block rounded-[var(--r2)] p-4"
          style={{ background: "var(--s1)" }}
        >
          <p className="text-sm font-bold text-[var(--t1)]">{name}</p>
          <p className="mt-1 text-xs text-[var(--t3)]">
            {top.ask ? `Ask ${money(top.ask)}` : "Ask not listed"}
            {top.city ? ` · ${top.city}` : ""}
            {top.source ? ` · ${String(top.source).replace(/_/g, " ")}` : ""}
          </p>
        </Link>
      ) : null}
    </div>
  );
}
