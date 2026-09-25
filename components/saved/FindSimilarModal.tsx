// components/saved/FindSimilarModal.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { X, Search, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface FindSimilarModalProps {
  isOpen: boolean;
  onClose: () => void;
  snapshot: {
    vin: string;
    year: number;
    make: string;
    model: string;
    trim?: string;
    odometer?: number;
    askingPrice?: number;
    marketValue?: number;
    estimatedProfit?: number;
  };
}

export function FindSimilarModal({
  isOpen,
  onClose,
  snapshot,
}: FindSimilarModalProps) {
  const [loading, setLoading] = useState(true);
  const [comparables, setComparables] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      make: snapshot.make,
      model: snapshot.model,
      year: String(snapshot.year),
      price: String(snapshot.askingPrice || 0),
      mileage: String(snapshot.odometer || 0),
    });

    fetch(`/api/find-similar?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch comparables");
        return res.json();
      })
      .then((data) => {
        setComparables(data);
      })
      .catch((err) => {
        console.error(err);
        setError("Could not search for similar vehicles. Please try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, snapshot]);

  if (!isOpen) return null;

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity duration-300 animate-fadeIn"
        style={{ background: "rgba(36,28,43,0.4)" }}
        onClick={onClose}
      />

      {/* Content */}
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[var(--b2)] overflow-hidden z-10 animate-scaleUp">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--b1)] bg-[var(--s1)]">
          <div>
            <h3 className="text-lg font-black text-[var(--t1)]">
              Find Similar Vehicles
            </h3>
            <p className="text-xs text-[var(--t3)]">
              Comparables for: {snapshot.year} {snapshot.make} {snapshot.model}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-[var(--amber)] animate-spin" />
              <p className="text-sm font-medium text-[var(--t3)]">
                Searching active inventory...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
              <p className="text-sm font-semibold text-red-600">{error}</p>
            </div>
          )}

          {!loading && !error && comparables.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--s1)] flex items-center justify-center mx-auto text-[var(--t4)]">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[var(--t2)]">
                  No similar deals found
                </p>
                <p className="text-xs text-[var(--t4)] max-w-sm mx-auto">
                  We couldn't find any other active listings matching this exact
                  description in our database right now.
                </p>
              </div>
            </div>
          )}

          {!loading && !error && comparables.length > 0 && (
            <div className="divide-y divide-[var(--b1)]">
              {comparables.map((comp) => (
                <div
                  key={comp.id}
                  className="flex items-center justify-between py-4 first:pt-0 last:pb-0 hover:bg-[var(--s1)]/30 px-3 -mx-3 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    {/* Image Thumbnail */}
                    <div className="w-16 h-12 bg-[var(--s2)] rounded-lg overflow-hidden flex-shrink-0 border border-[var(--b1)]">
                      <img
                        src={
                          comp.images?.[0] ||
                          "https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&q=80&w=150"
                        }
                        alt={comp.title}
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* Vehicle Text details */}
                    <div>
                      <h4 className="text-sm font-bold text-[var(--t1)]">
                        {comp.year} {comp.make} {comp.model} {comp.trim}
                      </h4>
                      <p className="text-xs text-[var(--t3)]">
                        {comp.mileage?.toLocaleString()} mi &bull;{" "}
                        {comp.location_city}, {comp.location_state}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs font-black text-[var(--t2)]">
                          {formatMoney(comp.ask_price)}
                        </span>
                        <Badge className="bg-[var(--green)] hover:bg-[var(--green)] text-white text-[9px] px-1 py-0 shadow-none border-none">
                          Score {comp.profit_score}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-3">
                    <div className="text-right hidden sm:block">
                      <span className="text-xs text-[var(--t4)] block uppercase font-bold tracking-wider">
                        Est. Profit
                      </span>
                      <span className="text-sm font-black text-[var(--green)]">
                        +{formatMoney(comp.profit_estimate)}
                      </span>
                    </div>
                    <Link
                      href={`/deal/${comp.id}`}
                      onClick={onClose}
                      className="flex items-center justify-center p-2 rounded-lg bg-[var(--s1)] text-[var(--t2)] hover:bg-[var(--amber)] hover:text-white transition-all shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-4 border-t border-[var(--b1)] bg-[var(--s1)]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[var(--t3)] hover:text-[var(--t1)] bg-white border border-[var(--b2)] rounded-lg shadow-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
