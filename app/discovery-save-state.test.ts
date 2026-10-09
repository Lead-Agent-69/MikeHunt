import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoveryDeal } from "@/components/discovery/types";

const state = vi.hoisted(() => ({
  user: "one" as string | null,
  loading: false,
  authError: null as string | null,
  rows: [] as { id: string; deal_id: string; user_id: string }[] | undefined,
  error: null as Error | null,
  configured: true,
}));
const mocks = vi.hoisted(() => ({
  swr: vi.fn(),
  mutate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({
    dealerId: state.user,
    loading: state.loading,
    error: state.authError,
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => state.configured,
}));
vi.mock("sonner", () => ({
  toast: { success: mocks.success, error: mocks.error },
}));
vi.mock("swr", () => ({
  default: (...args: unknown[]) => {
    mocks.swr(...args);
    return { data: state.rows, error: state.error, mutate: mocks.mutate };
  },
  useSWRConfig: () => ({ mutate: mocks.invalidate }),
}));
import {
  DiscoverySaveProvider,
  useDiscoverySave,
} from "@/components/discovery/DiscoverySaveProvider";
let root: Root;
let host: HTMLDivElement;
let control: ReturnType<typeof useDiscoverySave>;
function Card({ id }: { id: string }) {
  control = useDiscoverySave({
    id,
    source: "copart",
    askPrice: 100,
  } as DiscoveryDeal);
  return React.createElement(
    "button",
    { disabled: control.busy, "aria-label": control.label },
    String(control.saved),
  );
}
const render = (id = "deal-one") =>
  act(() =>
    root.render(
      React.createElement(
        DiscoverySaveProvider,
        null,
        React.createElement(Card, { id }),
      ),
    ),
  );
const toggle = () =>
  act(async () => {
    await control.toggle();
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
  state.user = "one";
  state.loading = false;
  state.authError = null;
  state.rows = [];
  state.error = null;
  state.configured = true;
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.mutate.mockResolvedValue([]);
  mocks.invalidate.mockResolvedValue(undefined);
  localStorage.clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Discovery bookmark account continuity", () => {
  it("scopes saved cache to the account and does not reuse previous-account state", () => {
    render();
    expect(mocks.swr.mock.lastCall?.[0]).toBe(
      "/api/saved-cars?filter=all&dealerId=one",
    );
    state.user = "two";
    state.rows = [];
    render();
    expect(mocks.swr.mock.lastCall?.[0]).toBe(
      "/api/saved-cars?filter=all&dealerId=two",
    );
    expect(control.saved).toBe(false);
    state.user = null;
    render();
    expect(mocks.swr.mock.lastCall?.[0]).toBeNull();
  });
  it("verifies list ownership and fails closed on malformed data", async () => {
    render();
    const loader = mocks.swr.mock.lastCall![1] as (
      url: string,
    ) => Promise<unknown>;
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify([{ id: "save", deal_id: "deal", user_id: "other" }]),
      ),
    );
    await expect(loader("/api/saved-cars")).rejects.toThrow(
      "could not be verified",
    );
  });
  it("saves confirmed account rows and sends the expected owner", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, id: "save-one" })),
    );
    render();
    await toggle();
    expect(mocks.success).toHaveBeenCalledWith("Saved to your account");
    expect(fetch).toHaveBeenCalledWith(
      "/api/saved-cars",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Save-Owner": "one" }),
      }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith();
  });
  it.each([
    { success: true, id: "demo", demo: true },
    { success: true },
    { error: "failed" },
  ])("rejects unconfirmed account save %j", async (body) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body)));
    render();
    await toggle();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("accepts a verified existing bookmark without duplicating it", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: "existing" }), { status: 409 }),
    );
    render();
    await toggle();
    expect(mocks.success).toHaveBeenCalledWith("Saved to your account");
  });
  it("does not populate Saved with incomplete rows or misreport a refresh failure as a failed save", async () => {
    mocks.mutate.mockRejectedValue(new Error("Refresh failed"));
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, id: "save-one" })),
    );
    render();
    await toggle();
    expect(mocks.mutate).toHaveBeenCalledWith();
    expect(mocks.success).toHaveBeenCalledWith("Saved to your account");
    expect(mocks.error).not.toHaveBeenCalled();
  });
  it("does not remove the bookmark when deletion returns a different id", async () => {
    state.rows = [{ id: "save-one", deal_id: "deal-one", user_id: "one" }];
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, id: "other" })),
    );
    render();
    await toggle();
    expect(control.saved).toBe(true);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("disables actions while loading and retries a failed list instead of treating it as empty", async () => {
    state.rows = undefined;
    render();
    expect(control.busy).toBe(true);
    await toggle();
    expect(fetch).not.toHaveBeenCalled();
    state.error = new Error("failed");
    render();
    expect(control.label).toBe("Retry saved vehicles");
    await toggle();
    expect(mocks.mutate).toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps live-search and guest bookmarks explicitly device-only", async () => {
    render("live-one");
    await toggle();
    expect(mocks.success).toHaveBeenCalledWith("Saved on this device only");
    expect(fetch).not.toHaveBeenCalled();
    state.user = null;
    render();
    expect(control.label).toBe("Save on this device");
  });
  it("does not update a switched account after an in-flight request", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render();
    let pending!: Promise<void>;
    act(() => {
      pending = control.toggle();
    });
    state.user = "two";
    state.rows = [];
    render();
    await act(async () => {
      resolve(new Response(JSON.stringify({ success: true, id: "save" })));
      await pending;
    });
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });
  it("coalesces double clicks while a save is in flight", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render();
    let first!: Promise<void>;
    act(() => {
      first = control.toggle();
    });
    await toggle();
    expect(fetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolve(new Response(JSON.stringify({ success: true, id: "save" })));
      await first;
    });
  });
});
