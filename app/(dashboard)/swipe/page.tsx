"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Layers, RefreshCw } from "lucide-react";
import { SwipeCardStack } from "@/components/ui/framer-components";
import { EmptyState } from "@/components/shared/EmptyState";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { savedScopeStates } from "@/lib/preferences/location-form";
import { inventoryScopeStates } from "@/lib/search/inventory-view-scope";
import {
  titleFilterOptions,
  titleTypeFromQuery,
  withTitleType,
} from "@/lib/deals/title-filter-options";

const SWIPE_TITLE_OPTIONS = titleFilterOptions(null, "Any title");
import { ErrorState } from "@/components/shared/PageStates";
import type { PriceEvidence } from "@/lib/deals/acquisition-price";
import { SwipeVehicleFace } from "@/components/search/SwipeVehicleFace";

// Rapid triage: the fastest way to clear a backlog of graded deals. Drag right to save,
// left to pass — the same two decisions the buttons below the stack make, for keyboard users.

const PAGE = 20;

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to load deals");
    return res.json();
  });

type SwipeDeal = {
  id: string;
  title?: string;
  year?: number;
  make?: string;
  model?: string;
  mileage?: number;
  condition?: string;
  damageType?: string;
  titleSource?: string | null;
  askPrice?: number;
  priceEvidence?: PriceEvidence;
  profitScore?: number;
  profitEstimate?: number;
  true_net_profit?: number;
  sellEstimate?: number;
  recommendedMaxBid?: number;
  dealVerdict?: "go" | "hold" | "pass";
  locationCity?: string;
  locationState?: string;
  source?: string;
  sourceUrl?: string;
  images?: string[];
};

function StackSkeleton() {
  return (
    <div
      className="shimmer rounded-[var(--r4)] border border-[var(--b1)]"
      style={{ height: 430 }}
      aria-hidden
    />
  );
}

export default function SwipePage() {
  const { query: sharedQuery, ready } = useInventoryViewScope();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const homeState = (
    effectiveHome(prefs)?.state ||
    savedScopeStates(prefs)?.[0] ||
    ""
  ).toUpperCase();
  // null = follow the saved scope's titleType; otherwise the swipe-only title choice.
  const [titleFilter, setTitleFilter] = useState<string | null>(null);
  const query = useMemo(() => {
    const params = new URLSearchParams(withTitleType(sharedQuery, titleFilter));
    if (
      homeState &&
      params.get("scope") !== "explicit" &&
      !params.has("state") &&
      !params.has("states")
    )
      params.set("state", homeState);
    return params.toString();
  }, [sharedQuery, homeState, titleFilter]);
  const swipeReady = ready && !prefsLoading;
  const scopeLabel =
    inventoryScopeStates(new URLSearchParams(query))?.join(", ") ||
    "Nationwide";
  const [batch, setBatch] = useState(0);
  // Bumped by "Start over" so a repeat of batch 0 still remounts the stack and clears counters.
  const [runId, setRunId] = useState(0);
  const [decided, setDecided] = useState(0);
  const [saved, setSaved] = useState(0);
  const [passed, setPassed] = useState(0);
  const [failedSaves, setFailedSaves] = useState<string[]>([]);
  const [pendingSaves, setPendingSaves] = useState<string[]>([]);
  const currentScope = useRef(query);
  currentScope.current = query;

  const [scopeBatch, setScopeBatch] = useState(query);
  const effectiveBatch = scopeBatch === query ? batch : 0;
  useEffect(() => {
    setScopeBatch(query);
    setBatch(0);
    setRunId((value) => value + 1);
    setSaved(0);
    setPassed(0);
  }, [query]);
  const {
    data,
    error,
    isLoading: dealsLoading,
    mutate,
  } = useSWR(
    swipeReady
      ? `/api/scan?${query}&sort=newest&pageSize=${PAGE}&page=${effectiveBatch}`
      : null,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: false },
  );
  const isLoading = !swipeReady || dealsLoading;

  const hasMore: boolean = !!data?.hasMore;

  // Memoised on `data` so the stack only resets its queue when a genuinely new batch arrives.
  const cards = useMemo(
    () =>
      ((data?.vehicles ?? []) as SwipeDeal[]).map((d) => ({
        id: d.id,
        content: <SwipeVehicleFace deal={d} />,
      })),
    [data],
  );

  // Decision counters are per-batch; a new batch starts from zero.
  useEffect(() => {
    setDecided(0);
  }, [batch, runId]);

  const persistSave = useCallback((id: string) => {
    const scope = currentScope.current;
    setPendingSaves((ids) => [...ids, id]);
    fetch("/api/saved-cars", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId: id }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        if (currentScope.current === scope) setSaved((n) => n + 1);
        setFailedSaves((ids) => ids.filter((value) => value !== id));
        toast.success("Saved to your garage");
      })
      .catch(() => {
        setFailedSaves((ids) => (ids.includes(id) ? ids : [...ids, id]));
        toast.error("Couldn't save. Sign in if needed, then retry.");
      })
      .finally(() =>
        setPendingSaves((ids) => ids.filter((value) => value !== id)),
      );
  }, []);
  const onSave = useCallback(
    (id: string) => {
      setDecided((n) => n + 1);
      persistSave(id);
    },
    [persistSave],
  );

  const onPass = useCallback(() => {
    setDecided((n) => n + 1);
    setPassed((n) => n + 1);
  }, []);

  const nextBatch = useCallback(() => {
    setBatch((b) => b + 1);
    setRunId((r) => r + 1);
  }, []);

  const startOver = useCallback(() => {
    setBatch(0);
    setRunId((r) => r + 1);
  }, []);

  const exhausted =
    !isLoading && cards.length > 0 && decided >= cards.length && !error;

  return (
    <div className="mx-auto w-full max-w-md space-y-5 pb-24 md:pb-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative"
      >
        <h1 className="relative flex items-center gap-2.5 text-xl font-bold text-[var(--t1)] md:text-2xl">
          <span
            className="flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-lg"
            style={{ background: "var(--grad)" }}
          >
            <Layers style={{ width: 18, height: 18 }} strokeWidth={2.5} />
          </span>
          Swipe
        </h1>
      </motion.div>
      <InventoryViewLinks
        query={query}
        current="/swipe"
        disabled={!swipeReady}
      />
      <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-[var(--t4)]">
        Title
        <select
          aria-label="Title filter"
          value={titleTypeFromQuery(query)}
          onChange={(event) => setTitleFilter(event.target.value)}
          className="min-h-11 rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-2 text-xs text-[var(--t1)]"
        >
          {SWIPE_TITLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      {failedSaves.length > 0 && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 border-y border-[var(--b1)] py-2 text-sm"
        >
          <span>
            {failedSaves.length} save{failedSaves.length === 1 ? "" : "s"} not
            completed
          </span>
          <button
            type="button"
            disabled={pendingSaves.length > 0}
            onClick={() => failedSaves.forEach(persistSave)}
            className="inline-flex min-h-11 items-center gap-2 px-2 disabled:opacity-50"
          >
            <RefreshCw className="h-4 w-4" /> Retry saves
          </button>
        </div>
      )}

      {/* Session tally */}
      <div className="flex items-center justify-between gap-2 text-[11px] font-bold">
        <span style={{ color: "var(--green)" }}>{saved} saved</span>
        <span className="font-mono text-[var(--t5)]">
          {prefsLoading
            ? "Loading your home state…"
            : `${scopeLabel} · batch ${effectiveBatch + 1}`}
        </span>
        <span className="text-[var(--t4)]">{passed} passed</span>
      </div>

      {(!ready || isLoading) && !cards.length ? (
        <StackSkeleton />
      ) : error && !data ? (
        <div data-testid="swipe-load-error">
          <ErrorState
            title="Couldn't load the swipe queue"
            message="This is not an empty triage deck. Saved inventory is still on Discover and Scan — retry when ready."
            onRetry={() => mutate()}
            retryLabel="Try again"
          />
          <button
            type="button"
            onClick={() => void mutate()}
            className="inline-flex min-h-11 items-center gap-2 px-4 text-sm"
          >
            <RefreshCw className="h-4 w-4" /> Try again
          </button>
        </div>
      ) : exhausted ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="glass-panel flex flex-col items-center gap-3 py-12 text-center"
        >
          <span className="text-3xl">🏁</span>
          <p className="text-sm font-bold text-[var(--t1)]">Batch cleared</p>
          <p className="text-xs text-[var(--t4)]">
            {saved} saved · {passed} passed this session
          </p>
          {hasMore ? (
            <button
              type="button"
              onClick={nextBatch}
              className="mt-1 rounded-full px-6 py-2.5 text-[13px] font-black text-white shadow-[var(--shadow2)] transition-transform hover:scale-[1.03] active:scale-95"
              style={{ background: "var(--grad)" }}
            >
              Load next {PAGE}
            </button>
          ) : (
            <button
              type="button"
              onClick={startOver}
              className="mt-1 rounded-full border border-[var(--b2)] bg-[var(--s0)] px-6 py-2.5 text-[13px] font-bold text-[var(--t2)] transition-colors hover:border-[var(--amber-bd)]"
            >
              Start over
            </button>
          )}
          <Link
            href="/saved"
            className="text-[11px] font-bold text-[var(--amber)] hover:underline"
          >
            Open your garage →
          </Link>
        </motion.div>
      ) : !cards.length ? (
        <div className="glass-panel" style={{ padding: 0 }}>
          <EmptyState
            icon="search"
            title="No deals to triage yet"
            message={
              scopeLabel !== "Nationwide"
                ? `No matching listings in ${scopeLabel} to review right now.`
                : "No saved-inventory listings are in the queue yet."
            }
          />
        </div>
      ) : (
        <SwipeCardStack
          key={`${batch}:${runId}`}
          cards={cards}
          onSave={onSave}
          onPass={onPass}
          height="clamp(500px, 65svh, 560px)"
        />
      )}
    </div>
  );
}
