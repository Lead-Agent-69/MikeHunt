export interface CustomerScrapeJob {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  heartbeat_at?: string | null;
  started_at?: string | null;
  result?: Record<string, any> | null;
}

export function sourceSearchStatusMessage(
  job: CustomerScrapeJob,
  now = Date.now(),
) {
  if (job.status === "pending")
    return "Your source search is waiting to begin. Existing matches remain available.";
  const lastUpdate = Date.parse(job.heartbeat_at || job.started_at || "");
  if (
    job.status === "running" &&
    Number.isFinite(lastUpdate) &&
    now - lastUpdate > 5 * 60_000
  )
    return "This search hasn't sent a recent update. We can't confirm it is still progressing. Existing matches remain available.";
  return "Checking your selected sources. Existing matches remain available.";
}

function abortError() {
  return new DOMException("Search monitoring cancelled", "AbortError");
}

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const cancel = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function readStatus(id: string, signal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  try {
    const response = await fetch(`/api/scrape/jobs/${encodeURIComponent(id)}`, {
      cache: "no-store",
      signal: controller.signal,
    });
    if (response.status === 401)
      throw new StatusError(
        "Sign in again to check this search. Your existing matches have not been removed.",
      );
    if (response.status === 404)
      throw new StatusError(
        "This search is no longer available. Start a new search when you're ready.",
      );
    if (!response.ok) throw new Error("Status temporarily unavailable");
    const body = await response.json();
    const job = body?.job;
    if (
      job?.id !== id ||
      !["pending", "running", "completed", "failed"].includes(job?.status)
    )
      throw new StatusError(
        "We couldn't verify this search's status. Your existing matches remain available.",
      );
    return job as CustomerScrapeJob;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

class StatusError extends Error {}

/** Read-only retries never resubmit collection or imply the background job was cancelled. */
export async function pollScopedScrapeJob(
  id: string,
  signal: AbortSignal,
  onUpdate: (message: string) => void,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    requestTimeoutMs?: number;
  } = {},
): Promise<CustomerScrapeJob | null> {
  const deadline = Date.now() + (options.timeoutMs ?? 10 * 60_000);
  let failures = 0;
  while (Date.now() < deadline) {
    if (signal.aborted) throw abortError();
    let job: CustomerScrapeJob;
    try {
      job = await readStatus(
        id,
        signal,
        Math.min(options.requestTimeoutMs ?? 15_000, deadline - Date.now()),
      );
    } catch (error) {
      if (signal.aborted) throw abortError();
      if (error instanceof StatusError) throw error;
      failures++;
      if (failures >= 3)
        throw new Error(
          "We lost the connection while checking your search. It may still be running; your existing matches remain available.",
        );
      onUpdate(
        "Connection interrupted. Rechecking your existing search; no duplicate search has been started.",
      );
      await wait(
        Math.min(
          options.intervalMs ?? 2500,
          Math.max(0, deadline - Date.now()),
        ),
        signal,
      );
      continue;
    }
    if (signal.aborted) throw abortError();
    if (Date.now() >= deadline) return null;
    failures = 0;
    if (job.status === "failed")
      throw new Error(
        "We couldn't check the selected sources. Try again later or choose another source.",
      );
    if (job.status === "completed") return job;
    onUpdate(sourceSearchStatusMessage(job));
    await wait(
      Math.min(options.intervalMs ?? 2500, Math.max(0, deadline - Date.now())),
      signal,
    );
  }
  return null;
}
