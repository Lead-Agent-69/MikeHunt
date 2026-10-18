import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SWRConfig, useSWRConfig, type ScopedMutator } from "swr";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useSavedCollection } from "@/hooks/useSavedCollection";
import { invalidateSavedCollections } from "@/lib/saved/invalidate-collections";
let root: Root;
let host: HTMLDivElement;
let control: ReturnType<typeof useSavedCollection>;
let cache: Map<any, any>;
let invalidate: ScopedMutator;
const id = "00000000-0000-0000-0000-000000000050";
const cursor = JSON.stringify({ id, savedAt: "2026-10-12T00:00:00Z" });
const response = (
  ownerId = "one",
  rows: any[] = [{ id: "first" }],
  nextCursor: string | null = cursor,
) => new Response(JSON.stringify({ ownerId, rows, nextCursor }));
function State({ owner }: { owner: string | null }) {
  invalidate = useSWRConfig().mutate;
  control = useSavedCollection(owner, "page");
  return React.createElement(
    "span",
    null,
    control.data?.map((row) => row.id).join(",") || "empty",
  );
}
async function render(owner: string | null) {
  await act(async () =>
    root.render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => cache, errorRetryInterval: 60_000 } },
        React.createElement(State, { owner }),
      ),
    ),
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  cache = new Map();
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
describe("account-safe saved paging", () => {
  it("refreshes a previously visited watchlist after a confirmed Market save without polling", async () => {
    vi.mocked(fetch).mockResolvedValue(response("one", [], null));
    await render("one");
    await vi.waitFor(() => expect(control.data).toEqual([]));
    await render(null);
    await act(async () => invalidateSavedCollections(invalidate, "one"));
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.mocked(fetch).mockResolvedValue(
      response("one", [{ id: "new-save" }], null),
    );
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("new-save"));
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("leaves other owners' cached pages untouched during save invalidation", async () => {
    vi.mocked(fetch).mockResolvedValue(
      response("two", [{ id: "other-save" }], null),
    );
    await render("two");
    await vi.waitFor(() => expect(host.textContent).toBe("other-save"));
    const before = Array.from(cache.entries()).filter(
      ([, value]) => value.data,
    );
    await act(async () => invalidateSavedCollections(invalidate, "one"));
    for (const [key, value] of before)
      expect(cache.get(key)?.data).toBe(value.data);
    expect(host.textContent).toBe("other-save");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not treat a cached empty collection as confirmed after refresh fails", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("one", [], null))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }));
    await render("one");
    await vi.waitFor(() => expect(control.data).toEqual([]));
    await act(async () => {
      await control.mutate().catch(() => {});
    });
    await vi.waitFor(() => expect(control.error).toBeTruthy());
  });
  it("retries a failed refresh when all pages were already loaded", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response("one", [{ id: "first" }], null))
      .mockResolvedValueOnce(new Response("{}", { status: 503 }))
      .mockResolvedValueOnce(
        response("one", [{ id: "first" }, { id: "new" }], null),
      );
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("first"));
    expect(control.hasMore).toBe(false);
    await act(async () => {
      await control.mutate().catch(() => {});
    });
    await vi.waitFor(() => expect(control.loadMoreError).toBeTruthy());
    await act(async () => {
      await control.loadMore();
    });
    await vi.waitFor(() => expect(host.textContent).toBe("first,new"));
  });
  it("keeps loaded rows usable when older-page fetching fails and retries without skipping", async () => {
    let olderRequests = 0;
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (!String(input).includes("cursor=")) return response();
      olderRequests += 1;
      return olderRequests === 1
        ? new Response("{}", { status: 503 })
        : response("one", [{ id: "second" }], null);
    });
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("first"));
    await act(async () => {
      await control.loadMore();
    });
    await vi.waitFor(() => expect(control.loadMoreError).toBeTruthy());
    expect(control.error).toBeUndefined();
    expect(host.textContent).toBe("first");
    expect(control.loadingMore).toBe(false);
    await act(async () => {
      await control.loadMore();
    });
    await vi.waitFor(() => expect(host.textContent).toBe("first,second"));
    expect(control.hasMore).toBe(false);
  });
  it("does not carry pages to another account or logout", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(response("two", [], null));
    await render("one");
    await vi.waitFor(() => expect(host.textContent).toBe("first"));
    await render("two");
    await vi.waitFor(() => expect(host.textContent).toBe("empty"));
    await render(null);
    expect(host.textContent).toBe("empty");
  });
  it("rejects a wrong-session empty receipt instead of caching it", async () => {
    vi.mocked(fetch).mockResolvedValue(response("two", [], null));
    await render("one");
    await vi.waitFor(() => expect(control.error).toBeTruthy());
    expect(control.data).toBeUndefined();
  });
});
