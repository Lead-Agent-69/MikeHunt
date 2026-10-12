import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SWRConfig } from "swr";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { useSavedCollection } from "@/hooks/useSavedCollection";
let root: Root;
let host: HTMLDivElement;
let control: ReturnType<typeof useSavedCollection>;
let cache: Map<any, any>;
const id = "00000000-0000-0000-0000-000000000050";
const cursor = JSON.stringify({ id, savedAt: "2026-10-12T00:00:00Z" });
const response = (
  ownerId = "one",
  rows: any[] = [{ id: "first" }],
  nextCursor: string | null = cursor,
) => new Response(JSON.stringify({ ownerId, rows, nextCursor }));
function State({ owner }: { owner: string | null }) {
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
