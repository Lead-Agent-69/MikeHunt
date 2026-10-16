"use client";

import { useState } from "react";
import { Flag } from "lucide-react";
import { usePreferences } from "@/hooks/usePreferences";

export function ReportListing({ listingId }: { listingId: string }) {
  const { authed, isLoading } = usePreferences();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState("price");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState<string | null>(null);
  const field =
    "w-full min-w-0 rounded-lg border border-[var(--b2)] bg-[var(--s0)] p-3 text-sm text-[var(--t1)]";
  return (
    <section className="min-w-0 border-t border-[var(--b1)] pt-4">
      <button
        type="button"
        disabled={isLoading}
        aria-expanded={open}
        aria-controls="listing-feedback-form"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[var(--t2)]"
      >
        <Flag size={16} aria-hidden="true" /> Report a listing issue
      </button>
      {open && (
        <div id="listing-feedback-form" className="mt-2 max-w-xl">
          {!authed ? (
            <a
              className="inline-flex min-h-11 items-center underline"
              href={`/login?next=${encodeURIComponent(`/deal/${listingId}`)}`}
            >
              Sign in to send a report
            </a>
          ) : receipt ? (
            <p role="status" className="text-sm text-[var(--t1)]">
              Report saved. Reference: {receipt}
            </p>
          ) : (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy || !comment.trim()) return;
                setBusy(true);
                setError("");
                const id = requestId || crypto.randomUUID();
                setRequestId(id);
                try {
                  const response = await fetch("/api/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      id,
                      listing_id: listingId,
                      category,
                      comment,
                    }),
                    signal: AbortSignal.timeout(12000),
                  });
                  const result = await response.json();
                  if (!response.ok || result.saved !== true || result.id !== id)
                    throw new Error("not-confirmed");
                  setReceipt(id);
                } catch {
                  setError(
                    "Your report was not confirmed. Your text is still here; try again.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label className="block text-sm text-[var(--t2)]">
                Issue category
                <select
                  className={field}
                  value={category}
                  disabled={busy}
                  onChange={(event) => {
                    setCategory(event.target.value);
                    setRequestId(null);
                  }}
                >
                  <option value="price">Incorrect price</option>
                  <option value="photos">Photos</option>
                  <option value="vehicle">Vehicle details</option>
                  <option value="estimate">Estimate or comparables</option>
                  <option value="usability">Difficult to use</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="block text-sm text-[var(--t2)]">
                What needs correcting?
                <textarea
                  required
                  maxLength={2000}
                  rows={4}
                  className={field}
                  disabled={busy}
                  value={comment}
                  onChange={(event) => {
                    setComment(event.target.value);
                    setRequestId(null);
                  }}
                />
              </label>
              <button
                disabled={busy || !comment.trim()}
                type="submit"
                className="min-h-11 rounded-lg bg-[var(--blue)] px-4 text-sm font-bold text-white disabled:opacity-50"
              >
                {busy ? "Sending..." : "Send report"}
              </button>
              {error && (
                <p role="alert" className="text-sm text-[var(--red)]">
                  {error}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </section>
  );
}
