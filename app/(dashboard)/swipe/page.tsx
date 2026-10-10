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
import { CarFront, Layers, RefreshCw } from "lucide-react";
import { SwipeCardStack } from "@/components/ui/framer-components";
import { EmptyState } from "@/components/shared/EmptyState";
import { proxiedImage } from "@/lib/image-url";
import { useInventoryViewScope } from "@/hooks/useInventoryViewScope";
import { InventoryViewLinks } from "@/components/search/InventoryViewLinks";
import { isFlipBuyerMode } from "@/lib/buyer/flip-lead";
import { dealCardCopy } from "@/lib/deals/deal-card-copy";
import { sourceLabel } from "@/lib/sources/source-meta";
import { usePreferences } from "@/hooks/usePreferences";
import { effectiveHome } from "@/lib/preferences/locations";
import { savedScopeStates } from "@/lib/preferences/location-form";
import { readCondition } from "@/lib/intelligence/condition";
import { inventoryScopeStates } from "@/lib/search/inventory-view-scope";

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
  askPrice?: number;
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

function DealFace({ deal, flipDesk }: { deal: SwipeDeal; flipDesk: boolean }) {
  const [imgFailed, setImgFailed] = useState(false);
  const img = proxiedImage(deal.images?.[0]);
  const title =
    deal.title ||
    `${deal.year ?? ""} ${deal.make ?? ""} ${deal.model ?? ""}`.trim() ||
    "Untitled deal";
  const location = [deal.locationCity, deal.locationState]
    .filter(Boolean)
    .join(", ");
  const sourceName = sourceLabel(deal.source, deal.sourceUrl);
  const conditionLabel = deal.condition
    ? readCondition(deal.condition, undefined, title)?.label || ""
    : "";
  const seller =
    (deal as { sellerType?: string }).sellerType === "dealer"
      ? "Dealer"
      : (deal as { sellerType?: string }).sellerType === "private"
        ? "Private"
        : "";

  return (
    <div className="flex h-full flex-col">
      {/* Photo — chips sit along the bottom edge so they never collide with the
          SAVE/PASS stamps the stack paints across the top corners. */}
      <div
        className="relative h-[46%] w-full shrink-0 overflow-hidden"
        style={{ background: "var(--s2)" }}
      >
        {img && !imgFailed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={img}
            alt={title}
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-2xl opacity-40">
            <CarFront className="h-8 w-8" aria-hidden="true" />
          </div>
        )}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(to top, rgba(0,0,0,0.82) 4%, transparent 55%)",
          }}
        />

        <div className="absolute bottom-12 left-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-black/75 px-3 py-2 text-white">
          <span className="mr-2 text-xs">
            {dealCardCopy(flipDesk).priceLabel(deal.source)}
          </span>
          <strong className="text-lg">
            {deal.askPrice != null && deal.askPrice > 0
              ? `$${Math.round(deal.askPrice).toLocaleString()}`
              : "Not reported"}
          </strong>
        </div>
        <div className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2">
          {deal.source && (
            <span
              className="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"
              style={{
                background: "rgba(20,10,20,.72)",
                backdropFilter: "blur(8px)",
              }}
            >
              {sourceName}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-2 overflow-hidden p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-[15px] font-bold leading-tight text-[var(--t1)]">
            {title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--t4)]">
          {deal.mileage ? (
            <span className="font-mono text-[var(--t3)]">
              {deal.mileage.toLocaleString()} mi
            </span>
          ) : null}
          {conditionLabel && <span>{conditionLabel}</span>}
          {location && <span className="truncate">{location}</span>}
          {deal.source && <span>{sourceName}</span>}
          {seller && <span>{seller}</span>}
        </div>

        <div className="mt-auto grid grid-cols-2 gap-2 border-t border-[var(--b1)] pt-2.5">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
              {dealCardCopy(flipDesk).priceLabel(deal.source)}
            </p>
            <span className="font-mono text-lg font-black leading-none tracking-tight text-[var(--t1)]">
              {deal.askPrice != null && deal.askPrice > 0
                ? `$${Math.round(deal.askPrice).toLocaleString()}`
                : "Not reported"}
            </span>
          </div>
          {flipDesk && (
            <div className="text-right">
              <p className="text-[9px] font-bold uppercase tracking-widest text-[var(--t4)]">
                Resale basis
              </p>
              <span className="text-[11px] font-semibold leading-snug text-[var(--t3)]">
                {deal.sellEstimate
                  ? `Ask-based estimate $${Math.round(deal.sellEstimate).toLocaleString()}`
                  : "Resale basis not on file."}
              </span>
            </div>
          )}
        </div>

        {flipDesk && (deal.sellEstimate || deal.recommendedMaxBid) && (
          <div className="grid grid-cols-2 gap-1.5 text-[10px]">
            <div
              className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
              style={{ background: "var(--s1)" }}
            >
              <span className="font-semibold text-[var(--t4)]">Sell est</span>
              <span className="font-mono font-bold text-[var(--t2)]">
                {deal.sellEstimate
                  ? `$${Math.round(deal.sellEstimate).toLocaleString()}`
                  : "—"}
              </span>
            </div>
            <div
              className="flex items-center justify-between rounded-[var(--r1)] px-2 py-1"
              style={{ background: "var(--s1)" }}
            >
              <span className="font-semibold text-[var(--t4)]">Max bid</span>
              <span className="font-mono font-bold text-[var(--green)]">
                {deal.recommendedMaxBid
                  ? `$${Math.round(deal.recommendedMaxBid).toLocaleString()}`
                  : "—"}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const { query: sharedQuery, ready, intent } = useInventoryViewScope();
  const { prefs, isLoading: prefsLoading } = usePreferences();
  const homeState = (
    effectiveHome(prefs)?.state ||
    savedScopeStates(prefs)?.[0] ||
    ""
  ).toUpperCase();
  const query = useMemo(() => {
    const params = new URLSearchParams(sharedQuery);
    if (
      homeState &&
      params.get("scope") !== "explicit" &&
      !params.has("state") &&
      !params.has("states")
    )
      params.set("state", homeState);
    return params.toString();
  }, [sharedQuery, homeState]);
  const swipeReady = ready && !prefsLoading;
  const scopeLabel =
    inventoryScopeStates(new URLSearchParams(query))?.join(", ") ||
    "Nationwide";
  const flipDesk = isFlipBuyerMode(intent?.buyerMode);
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
    { revalidateOnFocus: true, keepPreviousData: false },
  );
  const isLoading = !swipeReady || dealsLoading;

  const hasMore: boolean = !!data?.hasMore;

  // Memoised on `data` so the stack only resets its queue when a genuinely new batch arrives.
  const cards = useMemo(
    () =>
      ((data?.vehicles ?? []) as SwipeDeal[]).map((d) => ({
        id: d.id,
        content: <DealFace deal={d} flipDesk={flipDesk} />,
      })),
    [data, flipDesk],
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
      <InventoryViewLinks query={query} current="/swipe" />
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
        <div
          className="glass-panel"
          style={{ padding: 0 }}
          data-testid="swipe-load-error"
          role="alert"
        >
          <EmptyState
            icon="alert-triangle"
            title="Couldn't load the swipe queue"
            message="This is not an empty triage deck. Saved inventory is still on Discover and Scan — retry when ready."
            action={{ label: "Try again", onClick: () => mutate() }}
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
          height={430}
        />
      )}
    </div>
  );
}
