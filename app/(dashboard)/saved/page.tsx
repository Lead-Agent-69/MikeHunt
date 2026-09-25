// app/(dashboard)/saved/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import useSWR from "swr";
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
  Bookmark,
  HelpCircle,
  Link as LinkIcon,
  Camera,
  Key,
} from "lucide-react";
import { useDealerId } from "@/hooks/useDealerId";
import { SkeletonCard } from "@/components/shared/Skeleton";
import { EmptyState } from "@/components/shared/EmptyState";

// Fetcher function for SWR
const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error("Failed to fetch");
    return res.json();
  });

export default function SavedCarsPage() {
  const { dealerId, loading: dealerLoading } = useDealerId();
  const [filter, setFilter] = useState<
    "all" | "active" | "price_drops" | "gone"
  >("all");
  const [adding, setAdding] = useState(false);
  const [inputUrl, setInputUrl] = useState("");
  const [bookmarkletCode, setBookmarkletCode] = useState("");

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

  useEffect(() => {
    if (typeof window !== "undefined") {
      const code = `javascript:(function(){var url=window.location.href;var title=document.title;var price=(document.body.innerText.match(/\\$[\\d,]+/)||[''])[0];window.open('${window.location.origin}/save?url='+encodeURIComponent(url)+'&title='+encodeURIComponent(title)+'&price='+encodeURIComponent(price),'DealerHunt','width=420,height=600,left=200,top=100');})();`;
      setBookmarkletCode(code);
    }
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to remove this saved vehicle?")) return;

    try {
      // Optimistic update
      mutate(
        saves?.filter((item: any) => item.id !== id),
        false,
      );

      const res = await fetch(`/api/saved-cars/${id}`, { method: "DELETE" });
      if (res.ok) {
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
      } else {
        toast.error(data.error || "Failed to save vehicle");
      }
    } catch (e: any) {
      toast.error("Network error occurred");
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
            Watchlist snapshots, alerts, and sourcing ROI trends.
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
        className="flex p-1 rounded-xl self-start max-w-xs sm:max-w-md"
        style={{ background: "var(--s0)", boxShadow: "var(--shadow2)" }}
      >
        {(["all", "active", "price_drops", "gone"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all whitespace-nowrap border-none ${
              filter === tab
                ? "text-white"
                : "text-[var(--t4)] hover:text-[var(--t1)]"
            }`}
            style={filter === tab ? { background: "var(--grad)" } : {}}
          >
            {tab === "price_drops" ? "Price Drops" : tab}
          </button>
        ))}
      </div>

      {/* BOOKMARKLET & PWA SIDEBAR */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Main watchlist list */}
        <div className="lg:col-span-3 space-y-6">
          {authError || error ? (
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
          ) : !saves || saves.length === 0 ? (
            <div className="glass-panel" style={{ padding: 0 }}>
              <EmptyState
                icon="bell"
                title="Nothing saved yet"
                message="Paste a listing URL above — or use the bookmarklet — to watch a vehicle and get price-drop alerts."
              />
            </div>
          ) : (
            <div className="space-y-8">
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

        {/* Sidebar widgets */}
        <div className="space-y-6">
          {/* Bookmarklet widget */}
          <Card className="border-[var(--b2)] bg-[var(--s0)] shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
                <LinkIcon className="w-4 h-4 text-[var(--amber)]" />
                Browser Bookmarklet
              </CardTitle>
              <CardDescription className="text-xs leading-relaxed">
                Save any vehicle instantly while browsing desktop Craigslist,
                AutoTrader, or Copart.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 space-y-4">
              <div className="p-3 bg-[var(--s1)] rounded-lg text-center border border-dashed border-[var(--b2)]">
                {bookmarkletCode ? (
                  <a
                    href={bookmarkletCode}
                    onClick={(e) => e.preventDefault()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-[var(--amber)] hover:bg-[var(--amber-d)] text-white text-xs font-bold rounded-lg shadow cursor-grab active:cursor-grabbing select-none"
                    title="Drag me to your bookmark bar"
                  >
                    <Bookmark className="w-3.5 h-3.5" />+ Save to DH
                  </a>
                ) : (
                  <span className="text-xs text-[var(--t4)]">
                    Generating bookmarklet...
                  </span>
                )}
                <span className="block text-[10px] text-[var(--t4)] mt-2">
                  Drag this button to your Browser Bookmarks Bar.
                </span>
              </div>
              <div className="text-[11px] text-[var(--t3)] space-y-2 leading-relaxed">
                <p className="font-semibold text-[var(--t2)]">How to use:</p>
                <ul className="list-decimal list-inside space-y-1">
                  <li>Navigate to any listing page.</li>
                  <li>Click the "+ Save to DH" bookmark.</li>
                  <li>DH opens a popup, analyzes, and saves.</li>
                </ul>
              </div>
            </CardContent>
          </Card>

          {/* Mobile PWA instructions */}
          <Card className="border-[var(--b2)] bg-[var(--s0)] shadow-sm">
            <CardHeader className="p-5 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Camera className="w-4 h-4 text-[var(--green)]" />
                Mobile Share Sheet
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 text-xs text-[var(--t3)] space-y-3 leading-relaxed">
              <p>
                When using the mobile application, you can save listings
                directly from your phone's browser share sheet.
              </p>
              <div className="p-3 bg-[var(--s1)] rounded-lg border border-[var(--b1)] space-y-2">
                <p className="font-bold text-[var(--t2)] text-[10px] uppercase tracking-wider">
                  PWA Setup:
                </p>
                <ol className="list-decimal list-inside space-y-1 text-[11px]">
                  <li>Open app in Safari (iOS) or Chrome (Android).</li>
                  <li>Tap "Share" or menu &rarr; "Add to Home Screen".</li>
                  <li>
                    Now, tap Share on any vehicle page and choose "DealerHunt".
                  </li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
