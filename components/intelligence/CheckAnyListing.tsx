"use client";

import { useState } from "react";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";

// "Check any listing": one box (link, VIN, or "2018 Civic 71k $9,500 60432"), one card.
// Three numbers at most; everything else is behind "Why".

const money = (n: number | null | undefined) =>
  n == null ? "Not enough data" : `$${Math.round(n).toLocaleString("en-US")}`;

const VERDICT: Record<CheckListingRead["verdict"], { word: string; color: string }> = {
  buy: { word: "Buy", color: "var(--green)" },
  wait: { word: "Wait", color: "var(--amber, #d4a017)" },
  pass: { word: "Pass", color: "var(--red, #e5484d)" },
  not_enough_data: { word: "Not enough data", color: "var(--t4)" },
  not_live: { word: "Not live", color: "var(--t4)" },
};

const RATING: Record<string, string> = {
  good: "Good price",
  fair: "Fair price",
  negotiate: "Negotiate",
  over: "Over market",
};

const BASIS: Record<string, string> = {
  measured: "from recent sales",
  estimate: "from live asking prices",
  insufficient: "not enough data",
};

export function CheckAnyListing({ homeState }: { homeState?: string | null }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [read, setRead] = useState<CheckListingRead | null>(null);

  async function check(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim() || busy) return;
    setBusy(true);
    setError(null);
    setRead(null);
    try {
      const res = await fetch("/api/check-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: q.trim(), homeState: homeState || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error || "Couldn't check that one. Try again.");
      else setRead(body.read);
    } catch {
      setError("Couldn't reach MikeHunt. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const v = read ? VERDICT[read.verdict] : null;
  const car = read?.vehicle;

  return (
    <section className="glass-panel p-4 md:p-5" data-testid="check-any-listing">
      <h2 className="text-base font-bold text-[var(--t1)]">Check any listing</h2>
      <form onSubmit={check} className="mt-3 flex gap-2">
        <input
          aria-label="Listing link, VIN, or car details"
          placeholder="Paste a link, a VIN, or “2018 Civic 71k $9,500 60432”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-[44px] flex-1 rounded-lg border border-[var(--b2)] bg-[var(--s2)] px-3 text-sm text-[var(--t1)] placeholder:text-[var(--t4)]"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          className="min-h-[44px] rounded-lg bg-[var(--green)] px-4 text-sm font-bold text-black disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </form>

      {error ? (
        <p className="mt-3 text-sm text-[var(--t3)]" role="alert">
          {error}
        </p>
      ) : null}

      {read && v && car ? (
        <div className="mt-4 rounded-xl border border-[var(--b2)] p-4" data-testid="check-card">
          <p className="text-sm text-[var(--t3)]">
            {[car.year, car.make, car.model, car.trim].filter(Boolean).join(" ")}
            {car.mileage ? ` · ${Math.round(car.mileage / 1000)}k mi` : ""}
            {` · ${money(car.price)}`}
            {car.state ? ` · ${car.state}` : ""}
          </p>
          <p className="mt-2 text-2xl font-extrabold" style={{ color: v.color }}>
            {v.word}
          </p>
          <p className="mt-1 text-sm text-[var(--t1)]">{read.headline}</p>

          {read.priceRating ? (
            <p className="mt-1 text-xs font-semibold text-[var(--t3)]">{RATING[read.priceRating]}</p>
          ) : null}

          {read.fairValue.value != null ? (
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <dt className="text-[11px] text-[var(--t4)]">Buy ≤</dt>
                <dd className="font-bold text-[var(--t1)]">{money(read.maxBuy.value)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--t4)]">Fair value</dt>
                <dd className="font-bold text-[var(--t1)]">{money(read.fairValue.value)}</dd>
              </div>
              {read.profit?.net != null ? (
                <div>
                  <dt className="text-[11px] text-[var(--t4)]">
                    Profit{read.resale.state ? ` · sell in ${read.resale.state}` : ""}
                  </dt>
                  <dd className="font-bold text-[var(--t1)]">{money(read.profit.net)}</dd>
                </div>
              ) : (
                <div>
                  <dt className="text-[11px] text-[var(--t4)]">Confidence</dt>
                  <dd className="font-bold capitalize text-[var(--t1)]">{read.confidence.label}</dd>
                </div>
              )}
            </dl>
          ) : null}
          {read.fairValue.label ? (
            <p className="mt-2 text-[11px] text-[var(--t4)]">
              {read.fairValue.label}
              {read.fairValue.range
                ? ` · middle half ${money(read.fairValue.range.p25)}–${money(read.fairValue.range.p75)}`
                : ""}
            </p>
          ) : null}

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-semibold text-[var(--t3)]">Why</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--t3)]">
              {read.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-[var(--t4)]">
              Values are {BASIS[read.fairValue.basis] || read.fairValue.basis}. Confidence:{" "}
              {read.confidence.label}. {read.comps.asks} live asks, {read.comps.sold} sales compared.
            </p>
            {read.assumptions.length ? (
              <ul className="mt-1 space-y-0.5 text-[11px] text-[var(--t4)]">
                {read.assumptions.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            ) : null}
          </details>
        </div>
      ) : null}
    </section>
  );
}
