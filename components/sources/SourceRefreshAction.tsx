"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { BuyerScope } from "@/lib/scrapers/buyer-scope";
import { US_STATES } from "@/lib/geo";
import { createLatestRequest } from "@/lib/latest-request";
import { pollScopedScrapeJob } from "@/lib/scrapers/job-status-client";

const requestErrors: Record<number, string> = {
  400: "Check your location and search criteria, then try again.",
  401: "Sign in again to find new matches.",
  403: "Open this search in MIKEHUNT and try again.",
  422: "These sources cannot be refreshed for this search. Choose another source or buying plan.",
  429: "Please wait before requesting another search. Your existing matches remain available.",
  503: "New-match searches are temporarily unavailable. Existing matches remain available.",
};

export function SourceRefreshAction({
  scope,
  onSettled,
}: {
  scope: BuyerScope;
  onSettled: () => void;
}) {
  const requests = useRef(createLatestRequest());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const scopeKey = JSON.stringify(scope);
  const states = Array.from(
    new Set([scope.state, ...(scope.states || [])].filter(Boolean)),
  );
  const validLocation =
    states.length > 0 &&
    states.length <= 3 &&
    states.every((state) => [...US_STATES, "DC"].includes(state!));

  useEffect(() => {
    const manager = requests.current;
    setBusy(false);
    setMessage("");
    return () => manager.cancel();
  }, [scopeKey]);

  async function refresh() {
    if (!validLocation) return;
    const task = requests.current.start();
    setBusy(true);
    setMessage("Requesting a search of your selected market.");
    try {
      // A timeout ends local monitoring, not the server's collection job.
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(), 20_000);
      let response: Response;
      let body: any;
      try {
        response = await fetch("/api/scrape/request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
          signal: AbortSignal.any([task.signal, timeout.signal]),
        });
        if (response.ok) body = await response.json();
      } finally {
        clearTimeout(timer);
      }
      if (!task.isCurrent()) return;
      if (!response.ok) {
        setMessage(
          requestErrors[response.status] ||
            "We couldn't start this search. Existing matches remain available.",
        );
        return;
      }
      if (
        body?.queued !== true ||
        typeof body?.job?.id !== "string" ||
        !body.job.id
      ) {
        setMessage(
          "We couldn't confirm this search was queued. Check coverage before requesting it again.",
        );
        return;
      }
      setMessage(
        "Your selected-source search is queued. Existing matches remain available.",
      );
      const job = await pollScopedScrapeJob(
        body.job.id,
        task.signal,
        (status) => {
          if (task.isCurrent()) setMessage(status);
        },
      );
      if (!task.isCurrent()) return;
      setMessage(
        job
          ? "Search finished. Coverage is being checked again; new matching listings are not guaranteed."
          : "This search is taking longer than expected. It may still be running; existing matches remain available.",
      );
      onSettled();
    } catch {
      if (!task.isCurrent()) return;
      setMessage(
        "We couldn't confirm the search result. It may still be running. Check coverage before requesting it again.",
      );
      onSettled();
    } finally {
      if (task.isCurrent()) {
        setBusy(false);
        task.finish();
      }
    }
  }

  return (
    <div className="mt-4 space-y-2">
      <button
        type="button"
        onClick={refresh}
        disabled={!validLocation || busy}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--blue)] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={16} aria-hidden="true" />
        {busy ? "Checking selected sources" : "Check for new matches"}
      </button>
      <p
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="max-w-2xl text-sm text-[var(--t4)]"
      >
        {!validLocation
          ? "Choose a state above to check for new matches."
          : message}
      </p>
    </div>
  );
}
