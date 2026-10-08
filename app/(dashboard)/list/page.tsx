"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import { fetcher } from "@/lib/swr-config";
import { markInventoryListed } from "@/lib/inventory/update-listings";
import { ErrorState } from "@/components/shared/ErrorState";
import type { InventoryItem } from "@/lib/data/inventory-service";
import { useDealerId } from "@/hooks/useDealerId";

const PLATFORMS = [
  { id: "facebook", name: "Facebook Marketplace" },
  { id: "autotrader", name: "AutoTrader" },
  { id: "cargurus", name: "CarGurus" },
  { id: "cars.com", name: "Cars.com" },
  { id: "craigslist", name: "Craigslist" },
];
const PAGE_SIZE = 25;

export default function ListPage() {
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [confirmedPosted, setConfirmedPosted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [offset, setOffset] = useState(0);
  const [stage, setStage] = useState("recon,listed");
  const { dealerId, loading: authLoading } = useDealerId();
  const {
    data,
    error: swrError,
    isLoading,
    mutate,
  } = useSWR(
    dealerId
      ? `/api/inventory?dealerId=${dealerId}&stage=${stage}&limit=${PAGE_SIZE}&offset=${offset}`
      : null,
    fetcher,
    { refreshInterval: saving ? 0 : 180000 },
  );
  const loading = authLoading || isLoading;
  const error = swrError?.message || data?.error;
  const inventory: InventoryItem[] = data?.items || [];
  const visibleSelected = selectedVehicles.filter((id) =>
    inventory.some((vehicle) => vehicle.id === id),
  );
  const total = Number(data?.total || 0);

  function resetSelection() {
    setSelectedVehicles([]);
    setConfirmedPosted(false);
    setSaveError(null);
    setSavedCount(0);
  }
  async function recordListings() {
    if (
      saving ||
      !confirmedPosted ||
      !visibleSelected.length ||
      !selectedPlatforms.length ||
      error ||
      loading
    )
      return;
    setSaving(true);
    setSavedCount(0);
    setSaveError(null);
    try {
      const existing = Object.fromEntries(
        inventory.map((vehicle) => [vehicle.id, vehicle.listedPlatforms || []]),
      );
      const result = await markInventoryListed(
        visibleSelected,
        selectedPlatforms,
        fetch,
        existing,
      );
      setSavedCount(result.updatedIds.length);
      setSelectedVehicles(result.failedIds);
      setConfirmedPosted(false);
      if (result.failedIds.length)
        setSaveError(
          `${result.updatedIds.length} confirmed; ${result.failedIds.length} not confirmed. Reload inventory before retrying the remaining selection.`,
        );
      if (result.updatedIds.length) void mutate();
    } catch {
      setSaveError(
        "Listing records were not confirmed. Reload inventory before retrying.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-5 pb-28">
      <header className="border-b border-[var(--b1)] pb-4">
        <Link
          href="/fleet"
          className="inline-flex min-h-11 items-center gap-2 text-sm text-[var(--t3)]"
        >
          <ArrowLeft size={16} /> Pipeline
        </Link>
        <h1 className="text-2xl font-bold text-[var(--t1)]">Listing Manager</h1>
        <p className="mt-1 text-sm text-[var(--t3)]">
          Record where you have already posted a vehicle. No marketplace listing
          is published by this action.
        </p>
      </header>
      {!dealerId && !authLoading ? (
        <div className="space-y-2">
          <p>Sign in to manage your inventory listings.</p>
          <Link
            href="/login?next=%2Flist"
            className="inline-flex min-h-11 items-center text-[var(--blue)]"
          >
            Sign in
          </Link>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <label className="text-sm text-[var(--t2)]">
              Inventory stage
              <select
                value={stage}
                disabled={saving}
                onChange={(event) => {
                  setStage(event.target.value);
                  setOffset(0);
                  resetSelection();
                }}
                className="mt-1 block min-h-11 rounded-lg border border-[var(--b2)] bg-[var(--s0)] px-3"
              >
                <option value="recon,listed">Preparation and listed</option>
                <option value="recon">Preparation (recon)</option>
                <option value="listed">Already listed</option>
              </select>
            </label>
            <span className="text-sm text-[var(--t3)]">
              {visibleSelected.length} selected
            </span>
          </div>
          {loading ? (
            <p role="status" className="py-6 text-sm">
              Loading inventory...
            </p>
          ) : error ? (
            <ErrorState
              title="Couldn't load inventory"
              message={error}
              onRetry={() => mutate()}
            />
          ) : (
            <section aria-label="Inventory vehicles">
              {inventory.length === 0 ? (
                <div className="space-y-2 py-6">
                  <p>No vehicles in this stage.</p>
                  <Link
                    href="/fleet"
                    className="inline-flex min-h-11 items-center text-[var(--blue)]"
                  >
                    Review purchased vehicles in Pipeline
                  </Link>
                </div>
              ) : (
                inventory.map((vehicle) => {
                  const price = vehicle.listPrice;
                  const hasPrice =
                    price != null && Number.isFinite(price) && price >= 0;
                  return (
                    <label
                      key={vehicle.id}
                      className="flex min-h-20 cursor-pointer items-start gap-3 border-b border-[var(--b1)] py-4"
                    >
                      <input
                        type="checkbox"
                        disabled={saving}
                        checked={visibleSelected.includes(vehicle.id)}
                        onChange={() => {
                          setSelectedVehicles((previous) =>
                            previous.includes(vehicle.id)
                              ? previous.filter((id) => id !== vehicle.id)
                              : [...previous, vehicle.id],
                          );
                          setConfirmedPosted(false);
                          setSaveError(null);
                          setSavedCount(0);
                        }}
                        className="mt-1 h-5 w-5 shrink-0 accent-[var(--blue)]"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-semibold text-[var(--t1)]">
                          {[
                            vehicle.year || undefined,
                            vehicle.make,
                            vehicle.model,
                          ]
                            .filter(Boolean)
                            .join(" ") || "Vehicle"}
                        </span>
                        <span className="mt-1 block text-xs text-[var(--t3)]">
                          {vehicle.stage === "recon"
                            ? "Preparation (recon)"
                            : "Listed"}{" "}
                          ·{" "}
                          {hasPrice
                            ? `$${price.toLocaleString()} listing price`
                            : "Listing price not recorded"}
                        </span>
                        {vehicle.vin && (
                          <span className="mt-1 block break-all text-xs text-[var(--t3)]">
                            VIN {vehicle.vin}
                          </span>
                        )}
                        <span className="mt-1 block break-words text-xs text-[var(--t3)]">
                          Recorded marketplaces:{" "}
                          {vehicle.listedPlatforms?.length
                            ? vehicle.listedPlatforms.join(", ")
                            : "None"}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
              {(offset > 0 || data?.hasMore) && (
                <nav
                  aria-label="Inventory pages"
                  className="mt-4 flex flex-wrap items-center justify-between gap-2"
                >
                  <button
                    aria-label="Previous inventory page"
                    title="Previous page"
                    disabled={saving || offset === 0}
                    onClick={() => {
                      setOffset((previous) =>
                        Math.max(0, previous - PAGE_SIZE),
                      );
                      resetSelection();
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--b2)] disabled:opacity-40"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <span className="text-xs text-[var(--t3)]">
                    {inventory.length ? offset + 1 : 0}-
                    {offset + inventory.length} of {total}
                  </span>
                  <button
                    aria-label="Next inventory page"
                    title="Next page"
                    disabled={saving || !data?.hasMore}
                    onClick={() => {
                      setOffset((previous) => previous + PAGE_SIZE);
                      resetSelection();
                    }}
                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--b2)] disabled:opacity-40"
                  >
                    <ChevronRight size={20} />
                  </button>
                </nav>
              )}
            </section>
          )}
          <fieldset
            disabled={saving || loading || !!error}
            className="min-w-0 border-t border-[var(--b1)] pt-4"
          >
            <legend className="text-sm font-semibold text-[var(--t1)]">
              Posted marketplaces
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {PLATFORMS.map((platform) => (
                <label
                  key={platform.id}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedPlatforms.includes(platform.id)}
                    onChange={() => {
                      setSelectedPlatforms((previous) =>
                        previous.includes(platform.id)
                          ? previous.filter((id) => id !== platform.id)
                          : [...previous, platform.id],
                      );
                      setConfirmedPosted(false);
                      setSavedCount(0);
                      setSaveError(null);
                    }}
                    className="h-5 w-5 accent-[var(--blue)]"
                  />
                  {platform.name}
                </label>
              ))}
            </div>
            <label className="mt-4 flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                checked={confirmedPosted}
                onChange={(event) => setConfirmedPosted(event.target.checked)}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--blue)]"
              />
              <span>
                I have posted these vehicles on the selected marketplaces.
              </span>
            </label>
          </fieldset>
          <button
            disabled={
              saving ||
              loading ||
              !!error ||
              !visibleSelected.length ||
              !selectedPlatforms.length ||
              !confirmedPosted
            }
            onClick={recordListings}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--t1)] px-4 py-3 text-sm font-semibold text-[var(--s0)] disabled:opacity-40"
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Check size={16} />
            )}{" "}
            {saving ? "Recording..." : "Record posted listings"}
          </button>
          {savedCount > 0 && (
            <p role="status" className="text-sm text-[var(--green)]">
              {savedCount} vehicle record{savedCount === 1 ? "" : "s"} confirmed
              updated.
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-sm text-[var(--red)]">
              {saveError}
            </p>
          )}
          {saveError && (
            <button
              disabled={saving}
              onClick={() => mutate()}
              className="min-h-11 rounded-lg border border-[var(--b2)] px-3 text-sm"
            >
              Reload inventory
            </button>
          )}
        </>
      )}
    </div>
  );
}
