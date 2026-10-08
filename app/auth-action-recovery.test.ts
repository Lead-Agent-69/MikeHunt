import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
  signInWithOAuth: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createClientComponentClient: () => ({ auth: mocks }),
  isSupabaseConfigured: () => true,
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "personal" } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "own-user", loading: false }),
}));
import { AccountMenu } from "@/components/home/AccountMenu";
import { GoogleButton } from "@/components/shared/GoogleButton";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        authProviders: { reachable: true, google: true },
      }),
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(component: React.ComponentType) {
  await act(async () => {
    root.render(React.createElement(component));
  });
}
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (button) =>
      button.textContent?.includes(text) ||
      button.getAttribute("aria-label") === text,
  )!;
  await act(async () => {
    button.click();
  });
}
it("keeps a failed logout in the account and allows retry", async () => {
  mocks.signOut
    .mockResolvedValueOnce({ error: { message: "private provider detail" } })
    .mockResolvedValueOnce({ error: null });
  await render(AccountMenu);
  await click("Account menu");
  await click("Log out");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Could not log out",
  );
  expect(host.textContent).not.toContain("private provider detail");
  expect(mocks.replace).not.toHaveBeenCalled();
  await click("Log out");
  expect(mocks.replace).toHaveBeenCalledWith("/login");
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it("recovers from a thrown Google connection error", async () => {
  mocks.signInWithOAuth.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  await render(GoogleButton);
  await click("Continue with Google");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Check your connection",
  );
  expect(host.querySelector("button")?.disabled).toBe(false);
  expect(host.textContent).not.toContain("Connecting");
});
it("exposes admin navigation only for the server-verified current identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "own-user", isAdmin: true }),
    }),
  );
  await render(AccountMenu);
  await click("Account menu");
  expect(host.textContent).toContain("Admin dashboard");
});
it("does not expose admin tools for a different identity", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "different-user", isAdmin: true }),
    }),
  );
  await render(AccountMenu);
  await click("Account menu");
  expect(host.textContent).not.toContain("Admin dashboard");
});
