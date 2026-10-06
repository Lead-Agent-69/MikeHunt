"use client";

import React, { useState, useEffect } from "react";
import useSWR from "swr";
import { signalDismiss, signalUnsave } from "@/components/reco/deal-signals";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/supabase";
import { Ico } from "@/components/shared/Ico";
import { DealCard } from "@/components/shared/DealCard";
import { useLocalSavedVehicles } from "@/hooks/useLocalSavedVehicles";
import {
  scanHrefForSavedSearch,
  sourceProofHrefForSavedSearch,
  useLocalSavedSearches,
} from "@/hooks/useLocalSavedSearches";
import {
  SavedCarCard,
  type SavedCarStatus,
} from "@/components/saved/SavedCarCard";
import { qualityFieldLabel } from "@/lib/data-quality";
import { useBuyerIntent } from "@/hooks/useBuyerIntent";
import { hidesFlipNav, scanHrefForMode } from "@/components/layout/nav-items";

export default function AlertsPage() {
  const supabase = createClientComponentClient();
  const [userId, setUserId] = useState<string | null>(null);
  // Only offer "Sign in" once we know there is no session; /alerts is normally behind auth.
  const [authChecked, setAuthChecked] = useState(false);
  const signedOut = authChecked && !userId;
  const localSaved = useLocalSavedVehicles();
  const localSearches = useLocalSavedSearches();

  useEffect(() => {
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user) {
          setUserId(data.user.id);
          markAllRead();
        }
      })
      .catch(() => {})
      .finally(() => setAuthChecked(true));
  }, [supabase.auth]);

  // Server redacts flip economics for non-flip desks — never join deals from the browser.
  const {
    data: alertsPayload,
    error,
    isLoading: loading,
    mutate,
  } = useSWR(
    userId ? ["alerts", userId] : null,
    async () => {
      const res = await fetch("/api/alerts");
      if (res.status === 401) return { alerts: [], deskAccess: "personal" };
      if (!res.ok) throw new Error("Alerts unavailable");
      return res.json();
    },
    { revalidateOnFocus: false },
  );
  const alerts = Array.isArray(alertsPayload?.alerts)
    ? alertsPayload.alerts
    : [];
  const deskAccess = alertsPayload?.deskAccess === "flip" ? "flip" : "personal";
  const {
    data: savedCars = [],
    isLoading: savedLoading,
    mutate: mutateSavedCars,
  } = useSWR<any[]>(
    userId ? ["saved-cars-alerts", userId] : null,
    async () => {
      const res = await fetch("/api/saved-cars?filter=all");
      if (!res.ok) return [];
      return res.json();
    },
    { revalidateOnFocus: false },
  );
  const hasAnyWatchItem =
    alerts.length > 0 ||
    savedCars.length > 0 ||
    localSaved.count > 0 ||
    localSearches.count > 0;

  async function markAllRead() {
    await fetch("/api/alerts/unread", { method: "POST" });
  }

  async function dismissAlert(id: string) {
    const dealId = alerts.find((a: any) => a.id === id)?.deals?.id;
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    // Reco: dismissing an alert dismisses its listing (best-effort, only if the delete worked).
    if (res.ok) signalDismiss(dealId);
    mutate(
      {
        alerts: alerts.filter((a: any) => a.id !== id),
        deskAccess,
      },
      false,
    );
  }

  async function deleteSavedCar(id: string) {
    const dealId = savedCars.find((item: any) => item.id === id)?.deal_id;
    const res = await fetch(`/api/saved-cars/${id}`, {
      method: "DELETE",
    });
    if (res.ok) signalUnsave(dealId);
    mutateSavedCars(
      savedCars.filter((item: any) => item.id !== id),
      false,
    );
  }

  async function updateSavedCarStatus(id: string, status: SavedCarStatus) {
    mutateSavedCars(
      savedCars.map((item: any) =>
        item.id === id ? { ...item, status } : item,
      ),
      false,
    );
    await fetch(`/api/saved-cars/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    mutateSavedCars();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fadeUp">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">Alerts</h1>
          <p className="text-[var(--t3)]">
            New matches for your saved searches and the cars you&apos;re
            watching.
          </p>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s1)] px-4 py-3 text-sm text-[var(--t2)]"
        >
          <span>
            Server alerts couldn&apos;t load right now. Anything saved on this
            device still shows below.
          </span>
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-1.5 text-xs font-black text-[var(--t2)]"
          >
            Try again
          </button>
        </div>
      )}

      {loading || savedLoading ? (
        <div className="text-center py-12 text-[var(--t3)]">
          Loading alerts...
        </div>
      ) : !hasAnyWatchItem ? (
        <div className="text-center py-16 glass-panel">
          <Ico
            name="alert-triangle"
            size={32}
            className="mx-auto text-[var(--t4)] mb-3"
          />
          <h3 className="text-lg font-bold text-[var(--t1)] mb-1">
            No alerts yet
          </h3>
          <p className="text-[var(--t3)] max-w-sm mx-auto">
            Save a search or watch a car, and new matches and price changes show
            up here.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Link
              href="/searches"
              className="inline-flex rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
            >
              Create saved search
            </Link>
            <Link
              href="/discover"
              className="inline-flex rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
            >
              Browse Discover
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {alerts.length > 0 && (
            <ServerAlertGrid
              alerts={alerts}
              deskAccess={deskAccess}
              onDismiss={dismissAlert}
            />
          )}
          {savedCars.length > 0 && (
            <ServerWatchInbox
              items={savedCars}
              onDelete={deleteSavedCar}
              onUpdateStatus={updateSavedCarStatus}
            />
          )}
          {localSaved.count > 0 && (
            <LocalWatchInbox
              items={localSaved.items}
              onRemove={localSaved.remove}
              signedOut={signedOut}
            />
          )}
          {localSearches.count > 0 && (
            <LocalSearchInbox
              searches={localSearches.items}
              signedOut={signedOut}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ServerAlertGrid({
  alerts,
  deskAccess,
  onDismiss,
}: {
  alerts: any[];
  deskAccess: "flip" | "personal";
  onDismiss: (id: string) => void;
}) {
  const flipDesk = deskAccess === "flip";
  const { intent } = useBuyerIntent();
  const scanHref = scanHrefForMode(intent?.buyerMode);
  return (
    <div className="space-y-4">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
              New matches
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
              {alerts.length} fresh alert{alerts.length === 1 ? "" : "s"} ready.
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
              Matched to your saved searches. Check the source listing and price
              evidence before you act.
            </p>
          </div>
          <Link
            href={scanHref}
            className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
          >
            Open Scan
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {alerts.map((alert: any) => {
          const deal = alert.deals;
          if (!deal) return null;
          return (
            <div key={alert.id} className="relative group">
              {alert.status === "unread" && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-[var(--amber)] rounded-full shadow-[0_0_8px_var(--amber)] z-10" />
              )}
              {/* Always visible on touch; hover-reveal only where a pointer can hover. */}
              <div className="absolute -top-3 -right-3 z-20 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <button
                  type="button"
                  aria-label="Dismiss alert"
                  onClick={() => onDismiss(alert.id)}
                  className="p-1.5 bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--red)] hover:text-white rounded-full shadow-lg border border-[var(--b2)]"
                  title="Dismiss alert"
                >
                  <Ico name="x" size={14} />
                </button>
              </div>
              <DealCard
                flipDesk={flipDesk}
                id={deal.id}
                source={deal.source}
                year={deal.year}
                make={deal.make}
                model={deal.model}
                askPrice={Number(deal.ask_price) || 0}
                mmrValue={Number(deal.mmr_value) || 0}
                // Server already stripped these for non-flip; never re-derive from the client.
                profitEstimate={
                  flipDesk ? Number(deal.profit_estimate) || 0 : 0
                }
                profitScore={
                  flipDesk && deal.profit_score != null
                    ? Number(deal.profit_score)
                    : undefined
                }
                locationCity={deal.location_city}
                locationState={deal.location_state}
                mileage={deal.mileage}
                condition={deal.condition}
                damageType={deal.damage_type}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocalSearchInbox({
  searches,
  signedOut,
}: {
  searches: any[];
  signedOut: boolean;
}) {
  const { intent } = useBuyerIntent();
  const showProfitTarget = !hidesFlipNav(intent?.buyerMode);
  return (
    <div className="space-y-4">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
              Local alert scopes
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
              {searches.length} saved search{searches.length === 1 ? "" : "es"}{" "}
              on this device.
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
              These scopes are ready to use now. Open matching Scan for live
              vehicles, or inspect Source Proof to confirm which sources can
              return rows for the saved intent.
            </p>
          </div>
          <Link
            href="/searches"
            className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
          >
            Manage searches
          </Link>
        </div>
      </div>

      <div className="grid gap-3">
        {searches.map((search) => (
          <div key={search.id} className="glass-panel p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      search.is_active ? "bg-[var(--green)]" : "bg-[var(--t4)]"
                    }`}
                  />
                  <h3 className="font-black text-[var(--t1)]">
                    {search.name || "Saved search"}
                  </h3>
                  <span className="rounded border border-[var(--b2)] px-1.5 py-0.5 text-[10px] font-black uppercase text-[var(--t4)]">
                    local
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--t3)]">
                  {search.make && <span>Make: {search.make}</span>}
                  {search.makes?.length ? (
                    <span>Makes: {search.makes.join(", ")}</span>
                  ) : null}
                  {search.model && <span>Model: {search.model}</span>}
                  {search.q && <span>Search: {search.q}</span>}
                  {search.state && <span>State: {search.state}</span>}
                  {search.lane && (
                    <span>Lane: {String(search.lane).replace(/-/g, " ")}</span>
                  )}
                  {search.seller_type && (
                    <span>Seller: {search.seller_type}</span>
                  )}
                  {search.title_type && <span>Title: {search.title_type}</span>}
                  {search.dealer_source_ids?.length ? (
                    <span>Dealers: {search.dealer_source_ids.join(", ")}</span>
                  ) : null}
                  {search.max_price && (
                    <span>
                      Max: ${Number(search.max_price).toLocaleString()}
                    </span>
                  )}
                  {search.min_price && (
                    <span>
                      Min: ${Number(search.min_price).toLocaleString()}
                    </span>
                  )}
                  {showProfitTarget && search.target_profit && (
                    <span>
                      Min profit: $
                      {Number(search.target_profit).toLocaleString()}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[var(--t4)]">
                  {signedOut
                    ? "Stored locally. Sign in later to sync server alerts and background matching."
                    : "Stored on this device."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href={scanHrefForSavedSearch(search)}
                  className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
                >
                  Open Scan
                </Link>
                <Link
                  href={sourceProofHrefForSavedSearch(search)}
                  className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
                >
                  Source proof
                </Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServerWatchInbox({
  items,
  onDelete,
  onUpdateStatus,
}: {
  items: any[];
  onDelete: (id: string) => void;
  onUpdateStatus: (id: string, status: SavedCarStatus) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
              Watch inbox
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
              {items.length} active watched vehicle
              {items.length === 1 ? "" : "s"}.
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
              No new price-drop alert yet. These saved vehicles are being
              tracked with source proof, data quality, and price evidence.
            </p>
          </div>
          <Link
            href="/saved"
            className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
          >
            Open watchlist
          </Link>
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((item) => (
          <SavedCarCard
            key={item.id}
            save={item}
            onDelete={onDelete}
            onUpdateStatus={onUpdateStatus}
          />
        ))}
      </div>
    </div>
  );
}

function LocalWatchInbox({
  items,
  onRemove,
  signedOut,
}: {
  items: ReturnType<typeof useLocalSavedVehicles>["items"];
  onRemove: (id: string) => void;
  signedOut: boolean;
}) {
  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);

  return (
    <div className="space-y-4">
      <div className="glass-panel p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[var(--t5)]">
              Local watch inbox
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
              {items.length} watched vehicle{items.length === 1 ? "" : "s"} on
              this device.
            </h2>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[var(--t4)]">
              {signedOut
                ? "These vehicles are saved on this device. Sign in to keep your watchlist available across devices."
                : "These vehicles are saved on this device."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/saved"
              className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
            >
              Open watchlist
            </Link>
            {signedOut && (
              <Link
                href="/login?next=%2Falerts"
                className="rounded-[var(--r2)] bg-[var(--t1)] px-3 py-2 text-xs font-black text-[var(--s0)]"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {items.map((item) => {
          const savedDays = Math.max(
            0,
            Math.round(
              (Date.now() - new Date(item.savedAt).getTime()) / 86_400_000,
            ),
          );
          const missing = item.dataQuality?.missing || [];
          const trustSummary =
            item.trustExplanation?.summary ||
            item.trustExplanation?.reasons?.slice(0, 3).join(" · ");
          const nextTrustChecks = item.trustExplanation?.nextChecks || [];
          return (
            <div
              key={item.id}
              className="glass-panel p-4"
              style={{ borderRadius: "var(--r4)" }}
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-[var(--r3)] bg-[var(--s1)]">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-black uppercase text-[var(--t5)]">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-[var(--s1)] px-2 py-1 text-[10px] font-black uppercase text-[var(--t4)]">
                        {item.source}
                        {item.locationState ? ` · ${item.locationState}` : ""}
                      </span>
                      <span className="rounded-full bg-[var(--amber-lo)] px-2 py-1 text-[10px] font-black uppercase text-[var(--amber-d)]">
                        Watching locally
                      </span>
                    </div>
                    <h3 className="mt-2 truncate text-base font-black text-[var(--t1)]">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--t4)]">
                      Saved {savedDays === 0 ? "today" : `${savedDays}d ago`}
                      {item.mileage
                        ? ` · ${item.mileage.toLocaleString()} mi`
                        : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-[var(--t4)]">
                      Data quality {item.dataQuality?.score ?? 0}/100
                      {missing.length
                        ? ` · missing ${missing
                            .slice(0, 3)
                            .map(qualityFieldLabel)
                            .join(", ")}`
                        : " · core details present"}
                    </p>
                    {trustSummary ? (
                      <p className="mt-1 text-[11px] leading-relaxed text-[var(--t4)]">
                        Trust proof: {trustSummary}
                        {typeof item.trustExplanation?.score === "number"
                          ? ` (${Math.round(item.trustExplanation.score)}/100)`
                          : ""}
                        {nextTrustChecks.length
                          ? ` · verify ${nextTrustChecks.slice(0, 2).join(", ")}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="mr-2">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[var(--t5)]">
                      Watched price
                    </p>
                    <p className="font-mono text-lg font-black text-[var(--t1)]">
                      {formatMoney(item.askPrice)}
                    </p>
                  </div>
                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--t2)]"
                    >
                      Source
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={() => onRemove(item.id)}
                    className="rounded-[var(--r2)] border border-[var(--b2)] bg-[var(--s0)] px-3 py-2 text-xs font-black text-[var(--red)]"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
