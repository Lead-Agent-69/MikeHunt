"use client";

import React, { useState, useEffect } from "react";
import { Ico } from "@/components/shared/Ico";
import { createClientComponentClient } from "@/lib/supabase";
import Link from "next/link";
import { toast } from "sonner";

export default function AuctionsPage() {
  const supabase = createClientComponentClient();
  const [runLists, setRunLists] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [isUploading, setIsUploading] = useState(false);
  const [auctionName, setAuctionName] = useState("");
  const [auctionDate, setAuctionDate] = useState("");
  const [vinText, setVinText] = useState("");
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    fetchRunLists();
  }, []);

  async function fetchRunLists() {
    setLoading(true);
    try {
      const res = await fetch("/api/auction/run-list");
      if (res.ok) {
        const data = await res.json();
        setRunLists(data);
      }
    } catch (err) {
      console.error("Failed to fetch run lists:", err);
    }
    setLoading(false);
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileLoading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        // Extract 17-char alphanumeric strings
        const matches = text.match(/\b[A-HJ-NPR-Z0-9]{17}\b/gi);
        if (matches && matches.length > 0) {
          setVinText(matches.join("\n"));
          toast.success(`Extracted ${matches.length} VINs from file`);
        } else {
          toast.error("No valid 17-character VINs found in file");
        }
      }
      setFileLoading(false);
    };
    reader.onerror = () => {
      toast.error("Failed to read file");
      setFileLoading(false);
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!auctionName || !auctionDate || !vinText.trim()) {
      toast.error("Please fill in all fields and provide VINs");
      return;
    }

    const payload = {
      auction_name: auctionName,
      auction_date: auctionDate,
      vins: vinText,
    };

    try {
      const res = await fetch("/api/auction/run-list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        toast.success("Run list uploaded — matched against live inventory.");
        setAuctionName("");
        setAuctionDate("");
        setVinText("");
        setIsUploading(false);
        fetchRunLists();
      } else {
        const data = await res.json();
        toast.error(data.error || "Failed to upload run list");
      }
    } catch (err) {
      toast.error("Network error submitting run list");
    }
  }

  // Pre-cache all deals for a run list in local storage for offline use
  async function handlePreCache(runList: any) {
    toast.info(`Caching ${runList.vins.length} vehicles for offline use...`);
    try {
      // Query the deals matching these VINs
      const { data: deals, error } = await supabase
        .from("deals")
        .select("*")
        .in("vin", runList.vins);

      if (error) throw error;

      // Save to localStorage under a specific key
      const cacheKey = `offline-runlist-${runList.id}`;
      localStorage.setItem(cacheKey, JSON.stringify(deals || []));

      // Save index/metadata of cached run lists
      const cachedListsRaw =
        localStorage.getItem("offline-runlists-index") || "[]";
      const cachedLists = JSON.parse(cachedListsRaw);
      if (!cachedLists.includes(runList.id)) {
        cachedLists.push(runList.id);
        localStorage.setItem(
          "offline-runlists-index",
          JSON.stringify(cachedLists),
        );
      }

      toast.success(`Successfully cached ${deals?.length || 0} deals offline!`);
    } catch (err) {
      console.error(err);
      toast.error("Failed to cache run list offline");
    }
  }

  return (
    <div
      className="max-w-5xl mx-auto px-4 py-8"
      style={{ animation: "fadeUp 300ms ease-out" }}
    >
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-[var(--t1)] mb-1">
            Auction Co-Pilot
          </h1>
          <p className="text-[var(--t3)]">
            Upload your run lists to pre-cache valuations and inspect them
            offline at the auction.
          </p>
        </div>
        <button
          onClick={() => setIsUploading(!isUploading)}
          className="flex items-center gap-2 px-4 py-2 rounded-[var(--r3)] font-bold text-white transition-all hover:scale-105 active:scale-95 shrink-0"
          style={{ background: "var(--amber)" }}
        >
          <Ico name={isUploading ? "x" : "plus"} size={16} />
          {isUploading ? "Cancel" : "Upload Run List"}
        </button>
      </div>

      {isUploading && (
        <form onSubmit={handleSubmit} className="glass-panel p-6 mb-8">
          <h2 className="text-lg font-bold text-[var(--t1)] mb-4">
            Upload Run List
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
            <div>
              <label className="block text-sm text-[var(--t2)] mb-1">
                Auction Name / Location
              </label>
              <input
                required
                value={auctionName}
                onChange={(e) => setAuctionName(e.target.value)}
                placeholder="e.g. Copart Dallas Lane C"
                className="w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)]"
              />
            </div>
            <div>
              <label className="block text-sm text-[var(--t2)] mb-1">
                Auction Date
              </label>
              <input
                required
                type="date"
                value={auctionDate}
                onChange={(e) => setAuctionDate(e.target.value)}
                className="w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)]"
              />
            </div>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm text-[var(--t2)]">
                VIN List (one per line)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".csv,.txt"
                  id="vin-file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={fileLoading}
                />
                <label
                  htmlFor="vin-file"
                  className="text-xs text-[var(--amber)] hover:underline cursor-pointer flex items-center gap-1"
                >
                  <Ico name="parts" size={12} />
                  {fileLoading ? "Reading file..." : "Upload CSV / TXT instead"}
                </label>
              </div>
            </div>
            <textarea
              required
              rows={8}
              value={vinText}
              onChange={(e) => setVinText(e.target.value)}
              placeholder="Paste 17-char VINs here (comma, space, or newline separated)"
              className="w-full bg-[var(--s0)] border border-[var(--b2)] rounded-[var(--r2)] px-3 py-2 text-[var(--t1)] font-mono text-sm leading-relaxed"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 rounded-[var(--r3)] font-bold text-white bg-[var(--green)] hover:brightness-110 shadow-lg shadow-[rgba(46,204,113,0.15)]"
            >
              Queue Overnight Processing
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-center py-12 text-[var(--t3)] flex items-center justify-center gap-2">
          <Ico name="refresh" className="animate-spin text-[var(--amber)]" />
          Loading your lists...
        </div>
      ) : runLists.length === 0 ? (
        <div className="text-center py-16 glass-panel">
          <Ico
            name="list"
            size={40}
            className="mx-auto text-[var(--t4)] mb-4"
          />
          <h3 className="text-lg font-bold text-[var(--t1)] mb-1">
            No Run Lists Uploaded
          </h3>
          <p className="text-[var(--t3)] max-w-md mx-auto mb-6">
            Upload your first auction run list. We will decode the VINs, search
            for local comps, and pre-cache them.
          </p>
          <button
            onClick={() => setIsUploading(true)}
            className="px-5 py-2 rounded-[var(--r3)] font-bold text-sm text-white"
            style={{ background: "var(--grad)" }}
          >
            Create New List
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm font-bold text-[var(--t3)] px-1 uppercase tracking-wider">
            Your Active Run Lists
          </div>
          <div className="grid grid-cols-1 gap-4">
            {runLists.map((list) => {
              const pct =
                list.total_count > 0
                  ? Math.round((list.processed_count / list.total_count) * 100)
                  : 0;
              const formattedDate = new Date(
                list.auction_date,
              ).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "short",
                day: "numeric",
                timeZone: "UTC",
              });

              return (
                <div
                  key={list.id}
                  className="glass-panel p-5 flex flex-col md:flex-row md:items-center justify-between gap-5 transition-transform hover:scale-[1.005]"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-lg font-black text-[var(--t1)]">
                        {list.auction_name}
                      </h3>
                      <span
                        className="text-xs px-2.5 py-1 rounded-[var(--r3)] font-bold uppercase tracking-wider"
                        style={{
                          background:
                            list.status === "completed"
                              ? "rgba(46,204,113,0.15)"
                              : list.status === "processing"
                                ? "rgba(241,196,15,0.15)"
                                : list.status === "failed"
                                  ? "rgba(231,76,60,0.15)"
                                  : "rgba(255,255,255,0.05)",
                          color:
                            list.status === "completed"
                              ? "var(--green)"
                              : list.status === "processing"
                                ? "var(--amber)"
                                : list.status === "failed"
                                  ? "var(--red)"
                                  : "var(--t3)",
                        }}
                      >
                        {list.status}
                      </span>
                    </div>

                    <div className="text-sm text-[var(--t3)] flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                      <span className="flex items-center gap-1">
                        <Ico
                          name="clock"
                          size={14}
                          className="text-[var(--t4)]"
                        />
                        {formattedDate}
                      </span>
                      <span>·</span>
                      <span>{list.total_count} units</span>
                    </div>

                    {list.status === "processing" && (
                      <div className="w-full max-w-md bg-[var(--s2)] h-1.5 rounded-full overflow-hidden mt-3">
                        <div
                          className="bg-[var(--amber)] h-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    )}

                    {/* Match results — how many uploaded VINs we already track as scored deals, and how
                        many are actionable BUYs to bid on. Real matches only; nothing fabricated. */}
                    {list.status === "completed" &&
                      Array.isArray(list.results) &&
                      list.results.length > 0 &&
                      (() => {
                        const found = list.results.filter((r: any) => r.found);
                        const buys = found.filter(
                          (r: any) => r.verdict === "go",
                        );
                        return (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold">
                            <span
                              className="px-2 py-1 rounded-[var(--r3)]"
                              style={{
                                background: "rgba(46,204,113,0.15)",
                                color: "var(--green)",
                              }}
                            >
                              🎯 {buys.length} BUY{buys.length === 1 ? "" : "s"}
                            </span>
                            <span className="text-[var(--t3)]">
                              {found.length} tracked ·{" "}
                              {list.results.length - found.length} not in our
                              data yet
                            </span>
                          </div>
                        );
                      })()}
                  </div>

                  <div className="flex flex-wrap items-center gap-3 shrink-0">
                    <button
                      onClick={() => handlePreCache(list)}
                      className="px-4 py-2 rounded-[var(--r3)] text-sm font-semibold border border-[var(--b2)] bg-[var(--s1)] text-[var(--t2)] hover:text-[var(--t1)] hover:bg-[var(--s2)] transition-colors flex items-center gap-1.5"
                    >
                      <Ico name="refresh" size={14} />
                      Pre-cache Offline
                    </button>
                    <Link
                      href={`/lane?listId=${list.id}`}
                      className="px-5 py-2 rounded-[var(--r3)] text-sm font-bold text-white transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                      style={{ background: "var(--grad)" }}
                    >
                      <Ico name="scan" size={14} />
                      Enter Lane Mode
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
