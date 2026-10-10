import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDealerId } from "@/hooks/useDealerId";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
  configured: true,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => mocks.configured,
  createClientComponentClient: () => ({
    auth: { getSession: mocks.getSession, onAuthStateChange: mocks.subscribe },
  }),
}));
let host: HTMLDivElement;
let root: Root;
let result: ReturnType<typeof useDealerId>;
let authChanged: (event: string, session: any) => void;
function Probe() {
  result = useDealerId();
  return React.createElement(
    "div",
    null,
    result.loading
      ? "Checking account"
      : result.error || result.dealerId || "Signed out",
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.subscribe.mockImplementation((callback) => {
    authChanged = callback;
    return { data: { subscription: { unsubscribe: mocks.unsubscribe } } };
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(React.createElement(Probe)));
}
it("does not let a delayed session restore undo logout", async () => {
  let resolve!: (value: any) => void;
  mocks.getSession.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  expect(host.textContent).toBe("Checking account");
  await act(async () => authChanged("SIGNED_OUT", null));
  await act(async () =>
    resolve({ data: { session: { user: { id: "old-user" } } }, error: null }),
  );
  expect(result.dealerId).toBeNull();
  expect(host.textContent).toBe("Signed out");
});
it("does not let a delayed failure overwrite a newer sign-in", async () => {
  let reject!: (reason: Error) => void;
  mocks.getSession.mockReturnValueOnce(
    new Promise((_done, fail) => {
      reject = fail;
    }),
  );
  await render();
  await act(async () => authChanged("SIGNED_IN", { user: { id: "new-user" } }));
  await act(async () => reject(new Error("private provider details")));
  expect(result.dealerId).toBe("new-user");
  expect(result.error).toBeNull();
});
it("recovers from a failed session read with friendly feedback and retry", async () => {
  mocks.getSession
    .mockRejectedValueOnce(new Error("private provider details"))
    .mockResolvedValueOnce({
      data: { session: { user: { id: "own-user" } } },
      error: null,
    });
  await render();
  expect(result.loading).toBe(false);
  expect(host.textContent).toContain("Check your connection");
  expect(host.textContent).not.toContain("private provider");
  await act(async () => result.retry());
  expect(result.error).toBeNull();
  expect(result.dealerId).toBe("own-user");
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
});
it("treats a failed local account endpoint as a connection problem, not logout", async () => {
  mocks.configured = false;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
  await render();
  expect(result.loading).toBe(false);
  expect(result.error).toContain("retry");
  expect(host.textContent).not.toBe("Signed out");
});
it("unsubscribes and ignores a session response after navigation", async () => {
  let resolve!: (value: any) => void;
  mocks.getSession.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  await render();
  await act(async () => root.render(null));
  await act(async () =>
    resolve({ data: { session: { user: { id: "old-user" } } }, error: null }),
  );
  expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  expect(host.textContent).toBe("");
});
