import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  useMarketInventory,
  marketInventoryKey,
  type MarketInventoryPage,
} from "@/hooks/useMarketInventory";
import { MarketLoadMore } from "@/components/market/MarketLoadMore";

let host: HTMLDivElement;
let root: Root;
let cache: Map<any, any>;
let current: ReturnType<typeof useMarketInventory>;
const page = (
  index: number,
  total = 120,
  prefix = "MO",
): MarketInventoryPage => ({
  rows: Array.from(
    { length: Math.min(50, Math.max(0, total - index * 50)) },
    (_, offset) => ({ id: `${prefix}-${index * 50 + offset}` }) as any,
  ),
  total,
  page: index,
  pageSize: 50,
});
function Harness({
  query,
  count,
  fetcher,
}: {
  query: string;
  count: number;
  fetcher: (url: string) => Promise<MarketInventoryPage>;
}) {
  current = useMarketInventory(query, count, fetcher);
  return (
    <div>
      {current.rows.map((row) => (
        <span key={row.id}>{row.id},</span>
      ))}
    </div>
  );
}
const render = async (
  query: string,
  count: number,
  fetcher: (url: string) => Promise<MarketInventoryPage>,
) => {
  await act(async () =>
    root.render(
      <SWRConfig value={{ provider: () => cache, dedupingInterval: 0 }}>
        <Harness query={query} count={count} fetcher={fetcher} />
      </SWRConfig>,
    ),
  );
};
const settle = async (check: () => void) =>
  vi.waitFor(async () => {
    await act(async () => {
      await Promise.resolve();
    });
    check();
  });
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  cache = new Map();
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("appends beyond 50, preserves visible cars during loading, deduplicates and stops at the end", async () => {
  let resolveSecond!: (value: MarketInventoryPage) => void;
  const fetcher = vi.fn(async (url: string) => {
    const index = Number(
      new URL(url, "https://test.local").searchParams.get("page"),
    );
    if (index === 1)
      return new Promise<MarketInventoryPage>((resolve) => {
        resolveSecond = resolve;
      });
    return page(index);
  });
  await render("states=MO", 1, fetcher);
  await settle(() => expect(current.rows).toHaveLength(50));
  await render("states=MO", 2, fetcher);
  expect(current.rows).toHaveLength(50);
  expect(current.loadingMore).toBe(true);
  const second = page(1);
  second.rows[0] = page(0).rows[49];
  await act(async () => resolveSecond(second));
  await settle(() => expect(current.rows).toHaveLength(99));
  await render("states=MO", 3, fetcher);
  await settle(() => expect(current.rows).toHaveLength(119));
  expect(current.hasMore).toBe(false);
  expect(current.loadingMore).toBe(false);
  expect(fetcher.mock.calls.some(([url]) => url.includes("page=3"))).toBe(
    false,
  );
});

it("retains earlier batches on failure and retries the failed batch", async () => {
  let fail = true;
  const fetcher = vi.fn(async (url: string) => {
    const index = Number(
      new URL(url, "https://test.local").searchParams.get("page"),
    );
    if (index === 1 && fail) throw new Error("connection lost");
    return page(index);
  });
  await render("states=MO", 1, fetcher);
  await settle(() => expect(current.rows).toHaveLength(50));
  await render("states=MO", 2, fetcher);
  await settle(() => expect(current.loadMoreError).toBeTruthy());
  expect(current.rows).toHaveLength(50);
  expect(current.error).toBeUndefined();
  expect(current.loadingMore).toBe(false);
  fail = false;
  await act(async () => {
    await current.mutate();
  });
  await settle(() => expect(current.rows).toHaveLength(100));
});

it("does not append a late response from a previous search", async () => {
  let finishOld!: (value: MarketInventoryPage) => void;
  const fetcher = vi.fn(async (url: string) => {
    const params = new URL(url, "https://test.local").searchParams;
    const index = Number(params.get("page"));
    if (params.get("states") === "MO" && index === 1)
      return new Promise<MarketInventoryPage>((resolve) => {
        finishOld = resolve;
      });
    return page(index, 120, params.get("states")!);
  });
  await render("states=MO", 1, fetcher);
  await settle(() => expect(current.rows).toHaveLength(50));
  await render("states=MO", 2, fetcher);
  await render("states=IL", 1, fetcher);
  await settle(() => expect(host.textContent).toContain("IL-0"));
  await act(async () => finishOld(page(1)));
  expect(host.textContent).not.toContain("MO-");
  expect(current.rows).toHaveLength(50);
});

it("restores the cumulative batch depth and bounds requests by actual inventory", async () => {
  const fetcher = vi.fn(async (url: string) =>
    page(Number(new URL(url, "https://test.local").searchParams.get("page"))),
  );
  await render("states=MO", 10, fetcher);
  await settle(() => expect(current.rows).toHaveLength(120));
  expect(current.loadingMore).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(3);
  expect(marketInventoryKey(null, 0, null)).toBeNull();
  expect(marketInventoryKey("states=MO", 1, page(0, 0))).toBeNull();
});

it("prefetches near the footer once, disconnects, and offers manual retry without an auto-retry loop", async () => {
  let notify!: (entries: { isIntersecting: boolean }[]) => void;
  const disconnect = vi.fn();
  const observe = vi.fn();
  let options: IntersectionObserverInit | undefined;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(callback: typeof notify, opts: IntersectionObserverInit) {
        notify = callback;
        options = opts;
      }
      observe = observe;
      disconnect = disconnect;
    },
  );
  const more = vi.fn(),
    retry = vi.fn();
  const footer = (failed = false) => (
    <MarketLoadMore
      shown={50}
      total={120}
      hasMore
      loading={false}
      failed={failed}
      onLoadMore={more}
      onRetry={retry}
    />
  );
  act(() => root.render(footer()));
  expect(options?.rootMargin).toBe("900px 0px");
  act(() => {
    notify([{ isIntersecting: true }]);
    notify([{ isIntersecting: true }]);
  });
  expect(more).toHaveBeenCalledTimes(1);
  act(() => root.render(footer(true)));
  expect(disconnect).toHaveBeenCalled();
  expect(host.textContent).toContain("Your current results are still here");
  act(() => host.querySelector<HTMLButtonElement>("button")!.click());
  expect(retry).toHaveBeenCalledTimes(1);
  expect(more).toHaveBeenCalledTimes(1);
});

it.each([
  [119, 120],
  [101, 100],
])(
  "offers a real refresh rather than claiming completion when %s shown differs from %s total",
  (shown, total) => {
    const refresh = vi.fn();
    act(() =>
      root.render(
        <MarketLoadMore
          shown={shown}
          total={total}
          hasMore={false}
          loading={false}
          failed={false}
          onLoadMore={vi.fn()}
          onRetry={refresh}
        />,
      ),
    );
    expect(host.textContent).toContain("Results may have changed");
    expect(host.textContent).not.toContain("caught up");
    expect(host.querySelector("button")?.textContent).toBe("Refresh results");
    act(() => host.querySelector<HTMLButtonElement>("button")!.click());
    expect(refresh).toHaveBeenCalledOnce();
  },
);
