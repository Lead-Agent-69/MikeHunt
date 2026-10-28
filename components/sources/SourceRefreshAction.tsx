"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { BuyerScope } from "@/lib/scrapers/buyer-scope";
import { US_STATES } from "@/lib/geo";
import { createLatestRequest } from "@/lib/latest-request";
import {
  pollScopedScrapeJob,
  sourceSearchErrorMessage,
  sourceSearchStatusMessage,
  SourceSearchError,
  type CustomerScrapeJob,
} from "@/lib/scrapers/job-status-client";

const requestErrors: Record<number, string> = {
  400: "Check your location and search criteria, then try again.",
  401: "Sign in again to find new matches.",
  403: "Open this search in DealerHunt and try again.",
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
  const [jobId, setJobId] = useState<string | null>(null);
  const [phase, setPhase] = useState<"requesting" | "pending" | "running">(
    "requesting",
  );
  const lastStatus = useRef<CustomerScrapeJob | null>(null);
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
    setJobId(null);
    lastStatus.current = null;
    return () => manager.cancel();
  }, [scopeKey]);

  async function refresh() {
    if (!validLocation || busy) return;
    const task = requests.current.start();
    setBusy(true);
    setPhase(jobId ? "pending" : "requesting");
    setMessage(
      jobId
        ? "Checking your existing search; no new search has been started."
        : "Requesting a search of your selected market.",
    );
    try {
      let monitoredId = jobId;
      if (!monitoredId) {
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
        monitoredId = body.job.id;
        setJobId(monitoredId);
        setPhase("pending");
        setMessage(
          "Your selected-source search is queued. Existing matches remain available.",
        );
      }
      const job = await pollScopedScrapeJob(
        monitoredId!,
        task.signal,
        (status) => {
          if (task.isCurrent()) setMessage(status);
        },
        {
          onStatus: (status) => {
            if (!task.isCurrent()) return;
            lastStatus.current = status;
            setPhase(status.status === "pending" ? "pending" : "running");
            if (status.status === "completed" || status.status === "failed")
              setJobId(null);
          },
        },
      );
      if (!task.isCurrent()) return;
      if (job) setJobId(null);
      setMessage(
        job
          ? "Search finished. Coverage is being checked again; new matching listings are not guaranteed."
          : lastStatus.current
            ? `${sourceSearchStatusMessage(lastStatus.current)} Monitoring paused. Choose Check search status to resume updates.`
            : "This search is taking longer than expected. It may still be running; existing matches remain available. Choose Check search status to resume updates.",
      );
      onSettled();
    } catch (error) {
      if (!task.isCurrent()) return;
      if (
        error instanceof SourceSearchError &&
        (error.code === "missing" || error.code === "failed")
      )
        setJobId(null);
      setMessage(sourceSearchErrorMessage(error));
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
        className="btn btn-primary inline-flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
      >
        <RefreshCw size={16} aria-hidden="true" />
        {busy
          ? phase === "requesting"
            ? "Requesting search"
            : phase === "pending"
              ? "Search queued"
              : "Checking selected sources"
          : jobId
            ? "Check search status"
            : "Check for new matches"}
      </button>
      {!busy && message && (
        <button
          type="button"
          onClick={onSettled}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--b1)] px-4 py-2 text-sm font-semibold text-[var(--t1)]"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh available matches
        </button>
      )}
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
