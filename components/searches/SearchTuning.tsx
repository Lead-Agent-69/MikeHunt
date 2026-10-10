"use client";

import { useEffect, useId, useState } from "react";
import { createClientComponentClient } from "@/lib/supabase";
import {
  MIN_RATINGS_FOR_SUGGESTION,
  normalizeDeliveryMode,
  normalizePrecision,
  precisionSuggestion,
  type DeliveryMode,
  type MatchPrecision,
} from "@/lib/alerts/saved-search-match";

// Copy mirrors lib/alerts/saved-search-match.ts exactly. Don't promise more than it does.
const PRECISION_HELP: Record<MatchPrecision, string> = {
  tighter:
    "Skips cars the engine rated Pass or flagged with an implausible price, and, with a radius set, cars we can't place on the map.",
  standard: "Your filters as written.",
  looser:
    "Model also matches longer names (F-150 matches F-150 XLT) and the year range widens by one year each side. Price, profit and radius stay the same.",
};
const PRECISION_LABEL: Record<MatchPrecision, string> = {
  tighter: "Tighter",
  standard: "Standard",
  looser: "Looser",
};

export function SearchTuning({
  search,
  onChanged,
}: {
  search: any;
  onChanged: () => void;
}) {
  const [supabase] = useState(() => createClientComponentClient());
  const precisionId = useId();
  const deliveryId = useId();
  const [precision, setPrecision] = useState<MatchPrecision>(
    normalizePrecision(search.match_precision),
  );
  const [delivery, setDelivery] = useState<DeliveryMode>(
    normalizeDeliveryMode(search.delivery_mode),
  );
  const [ratings, setRatings] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // Ratings only feed the optional suggestion; a failed read just hides it.
    (async () => {
      try {
        const { data } = await supabase
          .from("user_feed_inbox")
          .select("feedback")
          .eq("search_id", search.id)
          .not("feedback", "is", null)
          .limit(200);
        if (!cancelled && Array.isArray(data))
          setRatings(data.map((r: any) => Number(r.feedback)).filter(Boolean));
      } catch {
        /* suggestion stays hidden */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [search.id, supabase]);

  async function save(patch: {
    match_precision?: MatchPrecision;
    delivery_mode?: DeliveryMode;
  }) {
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("user_saved_searches")
      .update(patch)
      .eq("id", search.id)
      .eq("user_id", search.user_id)
      .select("id")
      .maybeSingle();
    setSaving(false);
    if (err || !data) {
      setError("Setting not saved. Try again.");
      setPrecision(normalizePrecision(search.match_precision));
      setDelivery(normalizeDeliveryMode(search.delivery_mode));
      return;
    }
    onChanged();
  }

  const { suggest, down, total } = precisionSuggestion(ratings, precision);
  const select =
    "min-h-11 rounded-md border border-[var(--b2)] bg-[var(--s0)] px-2 text-sm text-[var(--t1)]";

  return (
    <div className="mt-3 space-y-2 text-xs text-[var(--t3)]">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={precisionId} className="font-semibold">
          Match precision
        </label>
        <select
          id={precisionId}
          className={select}
          value={precision}
          disabled={saving}
          onChange={(e) => {
            const v = normalizePrecision(e.target.value);
            setPrecision(v);
            void save({ match_precision: v });
          }}
        >
          {(["tighter", "standard", "looser"] as const).map((p) => (
            <option key={p} value={p}>
              {PRECISION_LABEL[p]}
            </option>
          ))}
        </select>
        <label htmlFor={deliveryId} className="font-semibold">
          Delivery
        </label>
        <select
          id={deliveryId}
          className={select}
          value={delivery}
          disabled={saving}
          onChange={(e) => {
            const v = normalizeDeliveryMode(e.target.value);
            setDelivery(v);
            void save({ delivery_mode: v });
          }}
        >
          <option value="instant">Instant</option>
          <option value="digest">Daily digest (email)</option>
        </select>
      </div>
      <p className="text-[var(--t4)]">
        {PRECISION_HELP[precision]}{" "}
        {delivery === "digest"
          ? "Matches still show in Alerts right away; email comes once a day as one digest."
          : "Email or text goes out as matches are found."}
      </p>
      {total > 0 && (
        <p className="text-[var(--t4)]">
          You rated {total} match{total === 1 ? "" : "es"} from this search (
          {down} not a good match).
          {total < MIN_RATINGS_FOR_SUGGESTION &&
            ` Rate ${MIN_RATINGS_FOR_SUGGESTION - total} more to get a suggestion.`}
        </p>
      )}
      {suggest && (
        <p className="flex flex-wrap items-center gap-2 text-[var(--t2)]">
          Based on your ratings, try {PRECISION_LABEL[suggest]}.
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setPrecision(suggest);
              void save({ match_precision: suggest });
            }}
            className="inline-flex min-h-11 items-center rounded-md border border-[var(--b2)] px-3 font-semibold"
          >
            Use {PRECISION_LABEL[suggest]}
          </button>
        </p>
      )}
      {error && (
        <p role="alert" className="text-[var(--red)]">
          {error}
        </p>
      )}
    </div>
  );
}
