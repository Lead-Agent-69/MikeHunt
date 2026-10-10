// components/saved/FindSimilarModal.tsx
"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Search, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface FindSimilarModalProps {
  flipDesk?: boolean;
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
  flipDesk = false,
  isOpen,
  onClose,
  snapshot,
}: FindSimilarModalProps) {
  const [loading, setLoading] = useState(true);
  const [comparables, setComparables] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Dialog keyboard behaviour: move focus in on open, trap Tab inside the
  // panel, close on Escape, and hand focus back to the trigger on close.
  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panel.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    const params = new URLSearchParams({
      make: snapshot.make,
      model: snapshot.model,
      year: String(snapshot.year),
      price: String(snapshot.askingPrice || 0),
      mileage: String(snapshot.odometer || 0),
    });

    fetch(`/api/find-similar?${params.toString()}`, {
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch comparables");
        return res.json();
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        // Route returns an array; tolerate a `{ deals: [] }` shape too.
        const rows = Array.isArray(data)
          ? data
          : Array.isArray(data?.deals)
            ? data.deals
            : [];
        setComparables(rows);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error(err);
        setError("Could not search for similar vehicles. Please try again.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    isOpen,
    snapshot.make,
    snapshot.model,
    snapshot.year,
    snapshot.askingPrice,
    snapshot.odometer,
    attempt,
  ]);

  if (!isOpen || typeof document === "undefined") return null;

  const formatMoney = (val: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(val);

  // Portal to <body>: the deal page wraps content in transformed motion
  // containers, which re-anchor `position: fixed` and pushed the sheet
  // off-screen below the fold on desktop.
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pb-24 md:pb-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 transition-opacity duration-300 animate-fadeIn"
        style={{ background: "rgba(36,28,43,0.4)" }}
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Content */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[min(80vh,calc(100dvh-8rem))] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[var(--b2)] bg-[var(--s1)] shadow-2xl animate-scaleUp"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--b1)] bg-[var(--s1)]">
          <div>
            <h3 id={titleId} className="text-lg font-black text-[var(--t1)]">
              Find Similar Vehicles
            </h3>
            <p className="text-xs text-[var(--t3)]">
              Similar listings: {snapshot.year} {snapshot.make} {snapshot.model}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close find similar vehicles"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--s2)] text-[var(--t3)] hover:text-[var(--t1)] transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12 space-y-3">
              <Loader2 className="w-8 h-8 text-[var(--amber)] animate-spin" />
              <p className="text-sm font-medium text-[var(--t3)]">
                Checking available listings...
              </p>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-center">
              <p role="alert" className="text-sm font-semibold text-red-700">
                {error}
              </p>
              <button
                type="button"
                onClick={() => setAttempt((value) => value + 1)}
                className="mt-2 min-h-11 px-4 font-semibold text-red-700 underline"
              >
                Try again
              </button>
            </div>
          )}

          {!loading && !error && comparables.length === 0 && (
            <div className="text-center py-12 space-y-3">
              <div className="w-12 h-12 rounded-full bg-[var(--s1)] flex items-center justify-center mx-auto text-[var(--t4)]">
                <Search className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-[var(--t2)]">
                  No similar listings yet
                </p>
                <p className="text-xs text-[var(--t4)] max-w-sm mx-auto">
                  No available listings match these filters right now. This
                  checks collected inventory; it does not run a live market
                  scan. Listing prices are asking prices, not verified sale
                  prices.
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
                  <div className="flex min-w-0 items-center gap-3">
                    {/* Image Thumbnail */}
                    <div className="w-16 h-12 bg-[var(--s2)] rounded-lg overflow-hidden flex-shrink-0 border border-[var(--b1)]">
                      {comp.images?.[0] ? (
                        <img
                          src={comp.images[0]}
                          alt={`${comp.year ?? ""} ${comp.make ?? ""} ${comp.model ?? ""}`.trim()}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full items-center justify-center text-[10px] text-[var(--t3)]">
                          No photo
                        </span>
                      )}
                    </div>

                    {/* Vehicle Text details */}
                    <div className="min-w-0 break-words">
                      <h4 className="text-sm font-bold text-[var(--t1)]">
                        {comp.year} {comp.make} {comp.model} {comp.trim}
                      </h4>
                      <p className="text-xs text-[var(--t3)]">
                        {comp.mileage?.toLocaleString()} mi &bull;{" "}
                        {comp.location_city}, {comp.location_state}
                      </p>
                      <div className="flex items-center space-x-2 mt-1">
                        <span className="text-xs font-black text-[var(--t2)]">
                          {Number(comp.ask_price) > 0
                            ? `${formatMoney(comp.ask_price)} asking`
                            : "Price not provided"}
                        </span>
                        {flipDesk && comp.profit_score != null ? (
                          <Badge className="bg-[var(--green)] hover:bg-[var(--green)] text-white text-[9px] px-1 py-0 shadow-none border-none">
                            Score {comp.profit_score}
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center space-x-3">
                    <Link
                      href={`/deal/${comp.id}`}
                      onClick={onClose}
                      aria-label={
                        `Open ${comp.year ?? ""} ${comp.make ?? ""} ${comp.model ?? ""}`
                          .replace(/\s+/g, " ")
                          .trim() || "Open listing"
                      }
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[var(--s2)] text-[var(--t2)] hover:bg-[var(--amber)] hover:text-white transition-all shadow-sm"
                    >
                      <ChevronRight className="w-4 h-4" aria-hidden="true" />
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
            type="button"
            onClick={onClose}
            className="min-h-11 px-4 py-2 text-xs font-bold text-[var(--t3)] hover:text-[var(--t1)] bg-[var(--s2)] border border-[var(--b2)] rounded-lg shadow-sm transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
