"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CheckListingRead } from "@/lib/intelligence/check-listing";
import { Ico } from "@/components/shared/Ico";
import { InlineError, LoadingState } from "@/components/shared/PageStates";

// "Check any listing": one box (link, VIN, or "2018 Civic 71k $9,500 60432"), one card.
// Card order matches the deal-page advisor card (spec: docs/check-listing-ux.md):
// verdict pill (the heading) → "Buy at or under $X" → headline → Fair value, Profit · sell in →
// "Why". A number without a value is left out, never guessed.

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

type VerdictKey = CheckListingRead["verdict"];

// The verdict is a word + an icon. The word is always --t1 (AA everywhere); colour only tints the
// icon (≥3:1 on light and dark surfaces) and the pill fill. Pass is neutral, not alarm-red text.
export const VERDICT: Record<
  VerdictKey,
  {
    word: string;
    icon: "check-circle" | "clock" | "x" | "alert-triangle" | "pause";
    tone: string;
    fill: string;
  }
> = {
  buy: {
    word: "Buy",
    icon: "check-circle",
    tone: "var(--green)",
    fill: "var(--glo)",
  },
  wait: {
    word: "Wait",
    icon: "clock",
    tone: "var(--orange)",
    fill: "var(--olo)",
  },
  pass: { word: "Pass", icon: "x", tone: "var(--red)", fill: "var(--s2)" },
  not_enough_data: {
    word: "Not enough data yet",
    icon: "alert-triangle",
    tone: "var(--t3)",
    fill: "var(--s2)",
  },
  not_live: {
    word: "Not live",
    icon: "pause",
    tone: "var(--t3)",
    fill: "var(--s2)",
  },
};

const RATING: Record<string, string> = {
  good: "Good price",
  fair: "Fair price",
  negotiate: "Negotiate",
  over: "Over market",
};

const BASIS: Record<string, string> = {
  measured: "from recent sales",
  estimate: "estimated from recent asking prices",
  insufficient: "not enough data yet",
};

type Failure = { message: string; retryable: boolean };

/** Sentence for the polite live region once a check finishes. */
export function announceRead(read: CheckListingRead): string {
  const v = VERDICT[read.verdict].word;
  if (read.verdict === "not_enough_data") return `${v}. ${read.headline}`;
  const cap =
    read.maxBuy.value != null
      ? ` Buy at or under ${money(read.maxBuy.value)}.`
      : "";
  return `Verdict: ${v}.${cap} ${read.headline}`;
}

export function CheckAnyListing({ homeState }: { homeState?: string | null }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [read, setRead] = useState<CheckListingRead | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const lastQuery = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const ids = useId();
  const inputId = `${ids}-q`;
  const hintId = `${ids}-hint`;
  const titleId = `${ids}-title`;
  const verdictId = `${ids}-verdict`;

  async function run(query: string) {
    if (!query || busy) return;
    lastQuery.current = query;
    setBusy(true);
    setFailure(null);
    setRead(null);
    setAnnouncement("Checking this listing…");
    try {
      const res = await fetch("/api/check-listing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query, homeState: homeState || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.read) {
        // 4xx (except rate limit) = fix the input, no retry. 429 / 5xx / bad body = try again.
        const retryable = res.ok || res.status >= 500 || res.status === 429;
        const message =
          body?.error ||
          (retryable
            ? "Couldn't check that one right now."
            : "Couldn't read that one. Check the link or details.");
        setFailure({ message, retryable });
        setAnnouncement(message);
      } else {
        setRead(body.read);
        setAnnouncement(announceRead(body.read));
      }
    } catch {
      const message = "Couldn't reach MikeHunt. Check your connection.";
      setFailure({ message, retryable: true });
      setAnnouncement(message);
    } finally {
      setBusy(false);
    }
  }

  // Move focus to the outcome so keyboard and screen-reader users land on the answer.
  useEffect(() => {
    if (read) resultRef.current?.focus();
    else if (failure && !failure.retryable) inputRef.current?.focus();
  }, [read, failure]);

  const v = read ? VERDICT[read.verdict] : null;
  const car = read?.vehicle;
  const thin = read?.verdict === "not_enough_data";
  const secondary: {
    label: string;
    value: string;
    note?: string;
    testId: string;
  }[] = [];
  if (read && !thin) {
    if (read.fairValue.value != null)
      secondary.push({
        label: "Fair value",
        value: money(read.fairValue.value),
        note: read.fairValue.range
          ? `Middle half ${money(read.fairValue.range.p25)}–${money(read.fairValue.range.p75)}`
          : undefined,
        testId: "check-fair",
      });
    if (read.profit?.net != null)
      secondary.push({
        label: read.resale.state
          ? `Profit · sell in ${read.resale.state}`
          : "Profit",
        value: money(read.profit.net),
        testId: "check-profit",
      });
  }

  return (
    <section
      aria-labelledby={titleId}
      className="glass-panel p-4 md:p-5"
      data-testid="check-any-listing"
    >
      <h2 id={titleId} className="text-base font-bold text-[var(--t1)]">
        Check any listing
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(q.trim());
        }}
        className="mt-3 flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor={inputId} className="sr-only">
          Listing link, VIN, or car details
        </label>
        <input
          ref={inputRef}
          id={inputId}
          aria-describedby={hintId}
          placeholder="Paste a link, a VIN, or “2018 Civic 71k $9,500 60432”"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          enterKeyHint="go"
          className="min-h-11 w-full min-w-0 flex-1 rounded-lg border border-[var(--b2)] bg-[var(--s2)] px-3 text-base text-[var(--t1)] placeholder:text-[var(--t4)] sm:text-sm"
        />
        <button
          type="submit"
          disabled={busy || !q.trim()}
          aria-busy={busy || undefined}
          className="min-h-11 shrink-0 rounded-lg bg-[var(--t1)] px-5 text-sm font-bold text-[var(--s0)] disabled:opacity-50"
        >
          {busy ? "Checking…" : "Check"}
        </button>
      </form>

      <p aria-live="polite" className="sr-only" data-testid="check-announce">
        {announcement}
      </p>

      {!read && !busy && !failure ? (
        <p
          id={hintId}
          className="mt-2 text-sm text-[var(--t3)]"
          data-testid="check-empty"
        >
          Works with a listing link, a 17-character VIN, or year, model, miles,
          price and ZIP. You get one answer: Buy, Wait or Pass.
        </p>
      ) : (
        <p id={hintId} className="sr-only">
          Paste a listing link, a VIN, or year, model, miles, price and ZIP.
        </p>
      )}

      {busy ? (
        <div data-testid="check-loading">
          <LoadingState label="Checking this listing…" variant="block" />
        </div>
      ) : null}

      {failure && !busy ? (
        <InlineError
          className="mt-3"
          testId="check-error"
          message={failure.message}
          onRetry={
            failure.retryable ? () => void run(lastQuery.current) : undefined
          }
        />
      ) : null}

      {read && v && car && !busy ? (
        <article
          aria-labelledby={verdictId}
          className="mt-4 rounded-xl border border-[var(--b2)] bg-[var(--s0)] p-4"
          data-testid="check-card"
          data-verdict={read.verdict}
        >
          <h3
            id={verdictId}
            ref={resultRef}
            tabIndex={-1}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xl font-extrabold text-[var(--t1)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--amber-d)]"
            style={{ background: v.fill }}
            data-testid="check-verdict"
          >
            <span style={{ color: v.tone }} className="inline-flex">
              <Ico name={v.icon} size={20} />
            </span>
            {v.word}
          </h3>

          {!thin && read.maxBuy.value != null ? (
            <div className="mt-3" data-testid="check-primary">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--t3)]">
                Buy at or under
              </p>
              <p className="text-3xl font-extrabold tabular-nums text-[var(--t1)]">
                {money(read.maxBuy.value)}
              </p>
            </div>
          ) : null}

          <p
            className="mt-2 text-sm text-[var(--t1)]"
            data-testid="check-headline"
          >
            {read.priceRating ? (
              <span className="font-semibold">
                {RATING[read.priceRating]} ·{" "}
              </span>
            ) : null}
            {read.headline}
          </p>

          <p
            className="mt-1 text-sm text-[var(--t2)]"
            data-testid="check-vehicle"
          >
            {[car.year, car.make, car.model, car.trim]
              .filter(Boolean)
              .join(" ")}
            {car.mileage ? ` · ${Math.round(car.mileage / 1000)}k mi` : ""}
            {` · asking ${money(car.price)}`}
            {car.state ? ` · ${car.state}` : ""}
            {read.live?.label ? ` · ${read.live.label}` : ""}
          </p>

          {secondary.length ? (
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--b1)] pt-3">
              {secondary.map((s) => (
                <div key={s.testId} data-testid={s.testId}>
                  <dt className="text-xs text-[var(--t3)]">{s.label}</dt>
                  <dd className="text-base font-bold tabular-nums text-[var(--t1)]">
                    {s.value}
                  </dd>
                  {s.note ? (
                    <dd className="text-xs text-[var(--t3)]">{s.note}</dd>
                  ) : null}
                </div>
              ))}
            </dl>
          ) : null}

          {thin ? (
            <p
              className="mt-3 text-sm text-[var(--t3)]"
              data-testid="check-thin"
            >
              No price is shown until enough comparable cars are tracked. Adding
              the trim and mileage can help.
            </p>
          ) : null}

          <details className="mt-3" open={thin}>
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-[var(--t2)]">
              Why
            </summary>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--t2)]">
              {read.why.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--t3)]">
              {read.fairValue.label ? `${read.fairValue.label}. ` : ""}
              Values are {BASIS[read.fairValue.basis] || read.fairValue.basis}.
              Confidence: {read.confidence.label}. Compared {read.comps.asks}{" "}
              asking prices and {read.comps.sold} sales.
            </p>
            {read.assumptions.length ? (
              <ul className="mt-1 space-y-0.5 text-xs text-[var(--t3)]">
                {read.assumptions.map((a) => (
                  <li key={a}>• {a}</li>
                ))}
              </ul>
            ) : null}
          </details>
        </article>
      ) : null}
    </section>
  );
}
