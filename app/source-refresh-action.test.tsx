import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SourceRefreshAction } from "@/components/sources/SourceRefreshAction";
import {
  pollScopedScrapeJob,
  SourceSearchError,
} from "@/lib/scrapers/job-status-client";
import type { BuyerScope } from "@/lib/scrapers/buyer-scope";

vi.mock("@/lib/scrapers/job-status-client", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("@/lib/scrapers/job-status-client")
  >()),
  pollScopedScrapeJob: vi.fn(),
}));
let root: Root;
let host: HTMLDivElement;
const fetchMock = vi.fn();
const settled = vi.fn();
const scope: BuyerScope = {
  state: "MO",
  lane: "private",
  q: "Ford",
  makes: ["FORD"],
  maxPrice: 18000,
  sellerType: "dealer",
  dealerSourceIds: ["dealer-billsmithauto-com"],
  dealerHosts: ["billsmithauto.com"],
};
const queued = () => ({
  ok: true,
  status: 202,
  json: async () => ({ queued: true, job: { id: "job-1" } }),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
async function render(value: BuyerScope = scope) {
  await act(async () =>
    root.render(<SourceRefreshAction scope={value} onSettled={settled} />),
  );
}
async function click() {
  await act(async () => host.querySelector("button")!.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset().mockResolvedValue(queued());
  settled.mockReset();
  vi.mocked(pollScopedScrapeJob)
    .mockReset()
    .mockResolvedValue({
      id: "job-1",
      status: "completed",
      result: { totalDeals: 999 },
    });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it.each([
  {},
  { state: "Nationwide" },
  { state: "XX" },
  { states: ["MO", "IL", "TX", "FL"] },
])("requires a bounded real state selection: %j", async (value) => {
  await render(value);
  expect(host.querySelector("button")!.disabled).toBe(true);
  await click();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Choose a state");
});

it("queues exactly the selected criteria without using the admin runner or inflating inventory", async () => {
  await render();
  expect(host.querySelector("button")!.classList.contains("btn-primary")).toBe(
    true,
  );
  await click();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("/api/scrape/request");
  expect(JSON.parse(init.body)).toEqual({ scope });
  expect(pollScopedScrapeJob).toHaveBeenCalledWith(
    "job-1",
    expect.any(AbortSignal),
    expect.any(Function),
    expect.objectContaining({ onStatus: expect.any(Function) }),
  );
  expect(host.textContent).toContain(
    "new matching listings are not guaranteed",
  );
  expect(host.textContent).not.toContain("999");
  expect(settled).toHaveBeenCalledOnce();
});

it("shows real waiting and running updates without blocking coverage", async () => {
  const pending = deferred<any>();
  vi.mocked(pollScopedScrapeJob).mockImplementation(
    async (_id, _signal, update) => {
      update(
        "Checking your selected sources. Existing matches remain available.",
      );
      return pending.promise;
    },
  );
  await render();
  await click();
  expect(host.querySelector("button")!.disabled).toBe(true);
  expect(host.querySelector('[role="status"]')!.textContent).toContain(
    "Existing matches remain available",
  );
  expect(settled).not.toHaveBeenCalled();
  await act(async () => pending.resolve({ id: "job-1", status: "completed" }));
  expect(host.querySelector("button")!.disabled).toBe(false);
});

it.each([401, 422, 429, 503, 500])(
  "uses friendly errors for HTTP %i, never the backend payload",
  async (status) => {
    fetchMock.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({ error: "Postgres secret internal stack trace" }),
    });
    await render();
    await click();
    expect(host.textContent).not.toContain("Postgres");
    expect(host.textContent).not.toContain("Search finished");
    expect(pollScopedScrapeJob).not.toHaveBeenCalled();
    expect(host.querySelector("button")!.disabled).toBe(false);
  },
);

it("does not announce success for malformed queue responses", async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ totalDeals: 400 }),
  });
  await render();
  await click();
  expect(host.textContent).toContain("couldn't confirm this search was queued");
  expect(pollScopedScrapeJob).not.toHaveBeenCalled();
});

it("rechecks the same search after a lost connection instead of submitting collection again", async () => {
  vi.mocked(pollScopedScrapeJob).mockRejectedValueOnce(
    new Error("backend failure"),
  );
  await render();
  await click();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(host.textContent).not.toContain("Search finished");
  expect(host.textContent).toContain("Check coverage");
  expect(host.querySelector("button")!.textContent).toContain(
    "Check search status",
  );
  await click();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(
    vi.mocked(pollScopedScrapeJob).mock.calls.map((call) => call[0]),
  ).toEqual(["job-1", "job-1"]);
  expect(host.textContent).toContain("Search finished");
});

it("distinguishes queued work from running work and keeps a known capacity notice after monitoring ends", async () => {
  const pending = deferred<any>();
  let statusUpdate!: NonNullable<
    Parameters<typeof pollScopedScrapeJob>[3]
  >["onStatus"];
  vi.mocked(pollScopedScrapeJob).mockImplementation(
    async (_id, _signal, _update, options) => {
      statusUpdate = options?.onStatus;
      options?.onStatus?.({ id: "job-1", status: "pending" });
      return pending.promise;
    },
  );
  await render();
  await click();
  expect(host.querySelector("button")!.textContent).toContain("Search queued");
  await act(async () => statusUpdate?.({ id: "job-1", status: "running" }));
  expect(host.querySelector("button")!.textContent).toContain(
    "Checking selected sources",
  );
  const now = Date.now();
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  await act(async () => {
    statusUpdate?.({
      id: "job-1",
      status: "pending",
      waiting: {
        reason: "daily_capacity",
        observedAt: new Date(now).toISOString(),
        nextCheckAt: next.toISOString(),
      },
    });
    pending.resolve(null);
  });
  expect(host.textContent).toContain("daily collection allowance");
  expect(host.textContent).toContain("not a finish time");
  expect(host.textContent).toContain("Monitoring paused");
  expect(host.querySelector("button")!.textContent).toContain(
    "Check search status",
  );
  expect(host.textContent).not.toContain("Search finished");
});

it.each(["authentication", "missing", "failed"] as const)(
  "keeps friendly %s recovery and permits a new request only for terminal searches",
  async (code) => {
    vi.mocked(pollScopedScrapeJob).mockRejectedValueOnce(
      new SourceSearchError(code),
    );
    await render();
    await click();
    expect(host.textContent).toContain(
      code === "authentication"
        ? "Sign in again"
        : code === "missing"
          ? "no longer available"
          : "couldn't check the selected sources",
    );
    expect(host.textContent).not.toContain("Search finished");
    await click();
    expect(fetchMock).toHaveBeenCalledTimes(code === "authentication" ? 1 : 2);
  },
);

it("does not call a monitoring timeout a completed or cancelled search", async () => {
  vi.mocked(pollScopedScrapeJob).mockResolvedValue(null);
  await render();
  await click();
  expect(host.textContent).toContain("may still be running");
  expect(host.textContent).not.toContain("Search finished");
  const reload = Array.from(
    host.querySelectorAll<HTMLButtonElement>("button"),
  ).find((button) => button.textContent?.includes("Refresh available matches"));
  expect(reload).toBeDefined();
  settled.mockClear();
  await act(async () => reload!.click());
  expect(settled).toHaveBeenCalledOnce();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(pollScopedScrapeJob).toHaveBeenCalledTimes(1);
});

it("aborts old monitoring on a scope change and ignores a late response", async () => {
  const pending = deferred<any>();
  vi.mocked(pollScopedScrapeJob).mockReturnValueOnce(pending.promise);
  await render();
  await click();
  const signal = vi.mocked(pollScopedScrapeJob).mock.calls[0][1];
  await render({ state: "IL" });
  expect(signal.aborted).toBe(true);
  await click();
  const current = host.textContent;
  await act(async () => pending.resolve({ id: "job-1", status: "completed" }));
  expect(host.textContent).toBe(current);
  expect(settled).toHaveBeenCalledOnce();
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    scope: { state: "IL" },
  });
});

it("ignores a late queue response after changing scope", async () => {
  const pending = deferred<any>();
  fetchMock.mockReturnValueOnce(pending.promise);
  await render();
  await click();
  await render({ state: "TX" });
  await act(async () => pending.resolve(queued()));
  expect(pollScopedScrapeJob).not.toHaveBeenCalled();
  expect(settled).not.toHaveBeenCalled();
});

it("aborts monitoring on unmount without announcing completion", async () => {
  const pending = deferred<any>();
  vi.mocked(pollScopedScrapeJob).mockReturnValueOnce(pending.promise);
  await render();
  await click();
  const signal = vi.mocked(pollScopedScrapeJob).mock.calls[0][1];
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  await act(async () => pending.resolve({ id: "job-1", status: "completed" }));
  expect(settled).not.toHaveBeenCalled();
});
