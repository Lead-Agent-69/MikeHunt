// app/(dashboard)/saved/page.tsx
"use client";

import React, { useState } from "react";
import useSWR from "swr";
import { signalUnsave } from "@/components/reco/deal-signals";
import { toast } from "sonner";
import { SavedCarCard, SavedCarStatus } from "@/components/saved/SavedCarCard";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/shared/ErrorState";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Plus,
  Link as LinkIcon,
  ExternalLink,
  Trash2,
  Phone,
  Mail,
} from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";
import {
  LocalSavedVehicle,
  saveLocalVehicle,
  useLocalSavedVehicles,
} from "@/hooks/useLocalSavedVehicles";
import { qualityFieldLabel } from "@/lib/data-quality";
import { userFacingErrorMessage } from "@/lib/user-facing-error";

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

function titleFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const slug = decodeURIComponent(parsed.pathname)
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z0-9]+$/i, "")
      .replace(/[-_]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return slug ? `${slug} · ${host}` : `Watched listing · ${host}`;
  } catch {
    return "Watched listing";
  }
}

function sourceFromUrl(url: string) {
  const lower = url.toLowerCase();
  if (lower.includes("copart")) return "copart";
  if (lower.includes("iaai")) return "iaa";
  if (lower.includes("govdeals")) return "govdeals";
  if (lower.includes("publicsurplus")) return "publicsurplus";
  if (lower.includes("craigslist")) return "craigslist";
  if (lower.includes("facebook")) return "facebook_marketplace";
  if (lower.includes("ebay")) return "ebay_motors";
  if (lower.includes("autotrader")) return "autotrader";
  if (lower.includes("cars.com")) return "cars_com";
  return "web-share";
}

export default function SavedCarsPage() {
  const { dealerId, loading: dealerLoading } = useDealerId();
  const localSaved = useLocalSavedVehicles();
  const [filter, setFilter] = useState<
    "all" | "active" | "price_drops" | "gone"
  >("all");
  const [adding, setAdding] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  // Use SWR for data fetching with automatic revalidation
  const {
    data: saves,
    error,
    isLoading,
    mutate,
  } = useSWR<any[]>(
    dealerId && !dealerLoading
      ? `/api/saved-cars?filter=${filter}&dealerId=${dealerId}`
      : null,
    fetcher,
    {
      revalidateOnFocus: true, // Refresh when user returns to tab
      revalidateOnReconnect: true,
      dedupingInterval: 30000, // 30 seconds
    },
  );

  const loading = isLoading || dealerLoading;
  const authError =
    !dealerLoading && !dealerId
      ? "Please sign in to view your saved cars."
      : null;
  const unsyncedLocalItems = localSaved.items.filter(
    (item) =>
      !saves?.some(
        (save) =>
          save.deal_id === item.id ||
          save.snapshot?.id === item.id ||
          save.snapshot?.dealId === item.id,
      ),
  );
  const canShowLocalSaves = unsyncedLocalItems.length > 0;
  const supabaseStatus =
    dealerLoading || isLoading
      ? "checking"
      : dealerId && !error
        ? "ready"
        : "missing";
  const cloudSyncReady = supabaseStatus === "ready";

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this saved vehicle?")) return;

    const dealId = saves?.find((item: any) => item.id === id)?.deal_id;
    try {
      // Optimistic update
      mutate(
        saves?.filter((item: any) => item.id !== id),
        false,
      );

      const res = await fetch(`/api/saved-cars/${id}`, { method: "DELETE" });
      if (res.ok) {
        // Reco: the save was logged server-side; record the unsave (best-effort).
        signalUnsave(dealId);
        // Revalidate from server
        mutate();
      } else {
        // Revert on error
        mutate();
        toast.error("Failed to delete saved car");
      }
    } catch (e: any) {
      console.error(e);
      mutate(); // Revert on error
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: SavedCarStatus) => {
    try {
      // Optimistic update
      mutate(
        saves?.map((item: any) =>
          item.id === id ? { ...item, status: newStatus } : item,
        ),
        false,
      );

      const res = await fetch(`/api/saved-cars/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        // Revalidate from server
        mutate();
      } else {
        // Revert on error
        mutate();
      }
    } catch (e: any) {
      console.error(e);
      mutate(); // Revert on error
    }
  };

  const handleSaveNewUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputUrl) return;

    setAdding(true);
    try {
      const res = await fetch("/api/save-from-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: inputUrl }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setInputUrl("");
        mutate(); // Refresh data from server
        toast.success("Vehicle saved to watchlist");
      } else if (res.status === 401 || res.status === 503 || data.local) {
        const localVehicle: LocalSavedVehicle = {
          id: `local-url-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          title: titleFromUrl(inputUrl),
          askPrice: 0,
          source: sourceFromUrl(inputUrl),
          sourceUrl: inputUrl,
          savedAt: new Date().toISOString(),
          dataQuality: {
            score: 22,
            label: "Sparse",
            missing: [
              "photo",
              "VIN",
              "title type",
              "mileage",
              "price",
              "seller",
              "auction date",
            ],
          },
        };
        saveLocalVehicle(localVehicle);
        setInputUrl("");
        toast.success("Saved locally. Sign in later to sync alerts.");
      } else {
        toast.error(
          userFacingErrorMessage(
            data.error,
            "We couldn't save this vehicle. Please try again.",
          ),
        );
      }
    } catch {
      const localVehicle: LocalSavedVehicle = {
        id: `local-url-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        title: titleFromUrl(inputUrl),
        askPrice: 0,
        source: sourceFromUrl(inputUrl),
        sourceUrl: inputUrl,
        savedAt: new Date().toISOString(),
        dataQuality: {
          score: 22,
          label: "Sparse",
          missing: [
            "photo",
            "VIN",
            "title type",
            "mileage",
            "price",
            "seller",
            "auction date",
          ],
        },
      };
      saveLocalVehicle(localVehicle);
      setInputUrl("");
      toast.success("Saved locally. Network sync can happen later.");
    } finally {
      setAdding(false);
    }
  };

  // Grouping
  const needsAttention =
    saves?.filter((s) =>
      ["price_drop", "price_increase", "ending_soon"].includes(s.status),
    ) || [];
  const activeSaves = saves?.filter((s) => s.status === "active") || [];
  const goneSaves = saves?.filter((s) => s.status === "unavailable") || [];
  const acquiredSaves = saves?.filter((s) => s.status === "acquired") || [];

  return (
    <div className="space-y-8 pb-20">
      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black text-[var(--t1)] tracking-tight">
            Saved Vehicles
          </h1>
          <p className="text-sm text-[var(--t3)]">
            Keep track of saved vehicles, price changes, and availability.
          </p>
        </div>

        {/* Save form directly inline */}
        <form
          onSubmit={handleSaveNewUrl}
          className="flex gap-2 w-full md:w-auto"
        >
          <Input
            type="url"
            placeholder="Paste Craigslist, Copart, or IAA URL..."
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            className="text-sm bg-[var(--s0)] border-[var(--b2)] focus:border-[var(--amber)] h-11 flex-1 md:w-64"
            required
          />
          <Button
            type="submit"
            disabled={adding}
            className="text-white text-sm font-bold px-5 h-11 flex items-center gap-1.5 shrink-0 rounded-xl border-none"
            style={{ background: "var(--grad)" }}
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add
          </Button>
        </form>
      </div>

      {/* FILTER BUTTONS */}
      <div
        className="flex w-full flex-wrap gap-1 p-1 rounded-lg self-start sm:w-auto"
        style={{ background: "var(--s0)", boxShadow: "var(--shadow2)" }}
      >
        {(["all", "active", "price_drops", "gone"] as const).map((tab) => (
          <button
            key={tab}
            aria-pressed={filter === tab}
            onClick={() => setFilter(tab)}
            className={`min-h-11 px-3 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap border-none ${
              filter === tab
                ? "text-white"
                : "text-[var(--t4)] hover:text-[var(--t1)]"
            }`}
            style={filter === tab ? { background: "var(--grad)" } : {}}
          >
            {
              {
                all: "All saved",
                active: "Available",
                price_drops: "Price drops",
                gone: "Unavailable",
              }[tab]
            }
          </button>
        ))}
      </div>

      <div className="glass-panel p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--t5)]">
              Watch readiness
            </p>
            <h2 className="mt-1 text-lg font-black text-[var(--t1)]">
              {cloudSyncReady
                ? "Cloud alerts are ready for this account."
                : canShowLocalSaves
                  ? "Local watchlist is working; cloud sync still needs account setup."
                  : "Save a vehicle to start watching locally."}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--t4)]">
              {cloudSyncReady
                ? "This account is syncing watchlist changes, alerts, and price tracking across devices. A local backup keeps recent saves resilient during brief network issues."
                : "Saved vehicles stay usable on this device immediately. Sign in with email or Google to sync alerts, notes, and price tracking across devices."}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <p className="text-lg font-black text-[var(--t1)]">
                {unsyncedLocalItems.length}
              </p>
              <p className="text-[10px] font-black uppercase text-[var(--t5)]">
                local only
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <p
                className="text-sm font-black uppercase"
                style={{
                  color:
                    supabaseStatus === "ready"
                      ? "var(--green)"
                      : "var(--amber)",
                }}
              >
                {supabaseStatus}
              </p>
              <p className="text-[10px] font-black uppercase text-[var(--t5)]">
                data
              </p>
            </div>
            <div className="rounded-[var(--r2)] border border-[var(--b1)] bg-[var(--s1)] px-3 py-2">
              <p
                className="text-sm font-black uppercase"
                style={{
                  color: dealerId ? "var(--green)" : "var(--amber)",
                }}
              >
                {dealerId ? "connected" : "guest"}
              </p>
              <p className="text-[10px] font-black uppercase text-[var(--t5)]">
                account
              </p>
            </div>
          </div>
        </div>
        {!cloudSyncReady && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[var(--r2)] border border-[var(--amber-bd)] bg-[var(--amber-lo)] px-3 py-2">
            <p className="text-xs leading-relaxed text-[var(--amber-d)]">
              Cloud alerts are not fully proven yet. Use local watching now;
              finish Google OAuth to sync alerts, notes, and price tracking
              across devices.
            </p>
            <a
              href="/login"
              className="rounded-[var(--r1)] bg-[var(--t1)] px-3 py-1.5 text-xs font-black text-[var(--s0)]"
            >
              Check login
            </a>
          </div>
        )}
      </div>

      {/* BOOKMARKLET & PWA SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main watchlist list */}
        <div className="lg:col-span-3 space-y-6">
          {(authError || error) && canShowLocalSaves ? (
            <LocalSavedSection
              items={unsyncedLocalItems}
              onRemove={localSaved.remove}
              syncUnavailableMessage={
                error
                  ? "Cloud sync is unavailable right now, but your local watchlist is still usable on this device."
                  : undefined
              }
            />
          ) : authError || error ? (
            <ErrorState
              title="Couldn't load saved cars"
              message={authError || error?.message || "An error occurred"}
              onRetry={() => mutate()}
            />
          ) : loading ? (
            <div className="grid grid-cols-1 gap-4">
              {[...Array(3)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : (!saves || saves.length === 0) && canShowLocalSaves ? (
            <LocalSavedSection
              items={unsyncedLocalItems}
              onRemove={localSaved.remove}
            />
          ) : !saves || saves.length === 0 ? (
            <div className="space-y-4">
              <div className="glass-panel" style={{ padding: 0 }}>
                <EmptyState
                  icon="bell"
                  title="Nothing saved yet"
                  message="Save a vehicle from Discover or paste a listing URL above to start a watchlist."
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              {canShowLocalSaves && (
                <LocalSavedSection
                  items={unsyncedLocalItems}
                  onRemove={localSaved.remove}
                />
              )}

              {/* 1. Needs Attention (Drops & urgent countdowns) */}
              {needsAttention.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[var(--red)] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)] animate-ping" />
                    Needs Attention ({needsAttention.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {needsAttention.map((saveItem) => (
                      <SavedCarCard
                        key={saveItem.id}
                        save={saveItem}
                        onDelete={handleDelete}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 2. Active Vehicles */}
              {activeSaves.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider">
                    Active Watchlist ({activeSaves.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {activeSaves.map((saveItem) => (
                      <SavedCarCard
                        key={saveItem.id}
                        save={saveItem}
                        onDelete={handleDelete}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 3. Gone / Sold Vehicles */}
              {goneSaves.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider">
                    No Longer Available ({goneSaves.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {goneSaves.map((saveItem) => (
                      <SavedCarCard
                        key={saveItem.id}
                        save={saveItem}
                        onDelete={handleDelete}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* 4. Acquired Fleet */}
              {acquiredSaves.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-[var(--t3)] uppercase tracking-wider">
                    Purchased Fleet ({acquiredSaves.length})
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    {acquiredSaves.map((saveItem) => (
                      <SavedCarCard
                        key={saveItem.id}
                        save={saveItem}
                        onDelete={handleDelete}
                        onUpdateStatus={handleUpdateStatus}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Save help */}
        <div className="space-y-6">
          <Card className="border-[var(--b2)] bg-[var(--s0)] shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="flex items-center gap-1.5 text-sm font-bold">
                <LinkIcon className="w-4 h-4 text-[var(--amber)]" />
                Save from anywhere
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Copy a vehicle listing link from any marketplace, then paste it
                into the field above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-5 text-xs leading-relaxed text-[var(--t3)]">
              <div className="rounded-[var(--r1)] border border-[var(--b1)] bg-[var(--s1)] p-3">
                <p className="font-semibold text-[var(--t2)]">
                  Local backup included
                </p>
                <p className="mt-1">
                  A recent copy remains on this device while cloud sync handles
                  cross-device alerts and tracking.
                </p>
              </div>
              <p>
                Sign in with email or Google to keep one watchlist across
                devices.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function LocalSavedSection({
  items,
  onRemove,
  syncUnavailableMessage,
}: {
  items: LocalSavedVehicle[];
  onRemove: (id: string) => void;
  syncUnavailableMessage?: string;
}) {
  const formatMoney = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value || 0);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--t3)]">
            Local-only saves ({items.length})
          </h3>
          <p className="text-xs text-[var(--t4)]">
            {syncUnavailableMessage ||
              "These saves are stored on this device and have not reached cloud sync yet."}
          </p>
        </div>
        <Badge
          className="border-none text-[10px] font-bold uppercase"
          style={{ background: "var(--glo)", color: "var(--green)" }}
        >
          Waiting to sync
        </Badge>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {items.map((item) => {
          const trustSummary =
            item.trustExplanation?.summary ||
            item.trustExplanation?.reasons?.slice(0, 3).join(" · ");
          const nextTrustChecks = item.trustExplanation?.nextChecks || [];
          const contactHref = item.sellerContactUrl || item.sourceUrl;
          return (
            <Card
              key={item.id}
              className="overflow-hidden border-none bg-[var(--s0)]"
              style={{ boxShadow: "var(--shadow2)", borderRadius: "var(--r4)" }}
            >
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <div className="relative h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-[var(--s1)]">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.image}
                        alt={item.title}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-bold uppercase text-[var(--t4)]">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <Badge
                      className="border-none text-[10px] font-bold uppercase"
                      style={{ background: "var(--s1)", color: "var(--t3)" }}
                    >
                      {item.source}
                      {item.sellerType ? ` · ${item.sellerType}` : ""}
                      {item.locationState ? ` · ${item.locationState}` : ""}
                    </Badge>
                    <h4 className="truncate text-base font-black text-[var(--t1)]">
                      {item.title}
                    </h4>
                    <p className="text-xs text-[var(--t4)]">
                      {item.mileage
                        ? `${item.mileage.toLocaleString()} mi · `
                        : ""}
                      Saved {new Date(item.savedAt).toLocaleDateString()}
                    </p>
                    {item.dataQuality && (
                      <p className="text-[11px] font-semibold text-[var(--t4)]">
                        Data quality {item.dataQuality.score}/100
                        {item.dataQuality.missing.length
                          ? ` · missing ${item.dataQuality.missing
                              .slice(0, 2)
                              .map(qualityFieldLabel)
                              .join(", ")}`
                          : ""}
                      </p>
                    )}
                    {trustSummary ? (
                      <p className="text-[11px] leading-relaxed text-[var(--t4)]">
                        Trust proof: {trustSummary}
                        {typeof item.trustExplanation?.score === "number"
                          ? ` (${Math.round(item.trustExplanation.score)}/100)`
                          : ""}
                        {nextTrustChecks.length
                          ? ` · verify ${nextTrustChecks.slice(0, 2).join(", ")}`
                          : ""}
                      </p>
                    ) : null}
                    {(item.seller ||
                      item.sellerPhone ||
                      item.sellerEmail ||
                      contactHref) && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-[var(--t3)]">
                        <span className="rounded-full bg-[var(--s1)] px-2 py-1 uppercase tracking-wide text-[var(--t5)]">
                          Seller
                        </span>
                        {item.seller ? (
                          <span className="rounded-full bg-[var(--s1)] px-2 py-1">
                            {item.seller}
                          </span>
                        ) : null}
                        {item.sellerPhone ? (
                          <a
                            href={`tel:${item.sellerPhone}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--s1)] px-2 py-1 hover:text-[var(--blue)]"
                          >
                            <Phone className="h-3 w-3" />
                            Call
                          </a>
                        ) : null}
                        {item.sellerEmail ? (
                          <a
                            href={`mailto:${item.sellerEmail}`}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--s1)] px-2 py-1 hover:text-[var(--blue)]"
                          >
                            <Mail className="h-3 w-3" />
                            Email
                          </a>
                        ) : null}
                        {contactHref ? (
                          <a
                            href={contactHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--s1)] px-2 py-1 hover:text-[var(--blue)]"
                          >
                            <ExternalLink className="h-3 w-3" />
                            Listing
                          </a>
                        ) : null}
                      </div>
                    )}
                    {(item.repairEstimate ||
                      item.transportEstimate ||
                      item.recommendedMaxBid ||
                      item.sellEstimate) && (
                      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-[var(--t3)]">
                        {item.sellEstimate ? (
                          <span className="rounded-full bg-[var(--s1)] px-2 py-1">
                            Sell $
                            {Math.round(item.sellEstimate).toLocaleString()}
                          </span>
                        ) : null}
                        {item.recommendedMaxBid ? (
                          <span className="rounded-full bg-[var(--glo)] px-2 py-1 text-[var(--green)]">
                            Max $
                            {Math.round(
                              item.recommendedMaxBid,
                            ).toLocaleString()}
                          </span>
                        ) : null}
                        {item.repairEstimate ? (
                          <span className="rounded-full bg-[var(--s1)] px-2 py-1">
                            Repair $
                            {Math.round(item.repairEstimate).toLocaleString()}
                          </span>
                        ) : null}
                        {item.transportEstimate ? (
                          <span className="rounded-full bg-[var(--s1)] px-2 py-1">
                            Transport $
                            {Math.round(
                              item.transportEstimate,
                            ).toLocaleString()}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <div className="mr-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--t4)]">
                      Price
                    </p>
                    <p className="font-mono text-lg font-black text-[var(--t1)]">
                      {formatMoney(item.askPrice)}
                    </p>
                    {item.estimatedProfit && item.estimatedProfit > 0 && (
                      <p className="text-xs font-bold text-[var(--green)]">
                        +{formatMoney(item.estimatedProfit)} est.
                      </p>
                    )}
                  </div>

                  {item.sourceUrl && (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-bold text-[var(--t2)] transition-colors hover:text-[var(--amber)]"
                      style={{ background: "var(--s1)" }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Source
                    </a>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onRemove(item.id)}
                    className="h-9 w-9 rounded-lg border-none p-0 text-[var(--red)] hover:bg-[var(--rlo)]"
                    title="Remove saved vehicle"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
