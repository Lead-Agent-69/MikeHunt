import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  data: undefined as any,
  error: undefined as any,
  isLoading: false,
  fetcher: undefined as any,
}));
vi.mock("swr", () => ({
  default: (_key: string, fetcher: any) => {
    state.fetcher = fetcher;
    return { ...state, mutate: vi.fn().mockResolvedValue(undefined) };
  },
}));
vi.mock("@/hooks/useDealerWatch", () => ({
  useDealerWatch: () => ({ hosts: ["recar.com"], sourceIds: ["recar"] }),
}));
vi.mock("@/components/discovery/DiscoveryCard", () => ({
  DiscoveryCard: ({ deal }: any) => <div>{deal.title}</div>,
}));
import { WatchedDealerFeed } from "@/components/discovery/WatchedDealerFeed";

beforeEach(() => {
  state.data = undefined;
  state.error = undefined;
  state.isLoading = false;
});
afterEach(() => vi.unstubAllGlobals());
const render = () => renderToStaticMarkup(<WatchedDealerFeed />);

it("does not report empty inventory while loading", () => {
  state.isLoading = true;
  const html = render();
  expect(html).toContain("Checking your watched dealers...");
  expect(html).not.toContain("No recent matching vehicles");
});
it("provides recovery on failure and retains already loaded cards", () => {
  state.error = new Error("offline");
  expect(render()).toContain("Retry watched dealer listings");
  expect(render()).not.toContain("No recent matching vehicles");
  state.data = { rails: [{ deals: [{ id: "one", title: "Existing car" }] }] };
  expect(render()).toContain("Existing car");
  expect(render()).toContain("Your saved shops haven&#x27;t changed");
});
it("separates an unavailable setup from a completed empty search and deduplicates cards", () => {
  state.data = { configured: false, rails: [] };
  expect(render()).toContain("Your watched shops are saved");
  state.data = { configured: true, rails: [] };
  expect(render()).toContain("No recent matching vehicles");
  const deal = { id: "one", title: "Existing car" };
  state.data = { rails: [{ deals: [deal] }, { deals: [deal] }] };
  expect(render().match(/Existing car/g)).toHaveLength(1);
});
it("rejects HTTP and soft failures instead of treating them as no cars", async () => {
  render();
  for (const [status, data] of [
    [503, { rails: [] }],
    [200, { rails: [], degraded: true }],
    [200, { error: "unavailable" }],
    [200, {}],
  ] as const) {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status })),
    );
    await expect(state.fetcher("/api/discover")).rejects.toThrow(
      "Watched listings unavailable",
    );
  }
});
