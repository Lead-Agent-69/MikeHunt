import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn(),
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
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
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
it("submits Google login through the cookie-preserving server route", async () => {
  await render(GoogleButton);
  const form = host.querySelector('form[action="/auth/google"]');
  const next = form?.querySelector<HTMLInputElement>('input[name="next"]');
  expect(form?.getAttribute("method")).toBe("get");
  expect(next?.value).toBe("/discover");
  expect(
    Array.from(form?.querySelectorAll("button") ?? []).some((button) =>
      button.textContent?.includes("Continue with Google"),
    ),
  ).toBe(true);
});

it("sanitizes the Google post-login destination before submission", async () => {
  await act(async () => {
    root.render(
      React.createElement(GoogleButton, {
        next: "https://attacker.example/steal",
      }),
    );
  });
  expect(
    host.querySelector<HTMLInputElement>('input[name="next"]')?.value,
  ).toBe("/market");
});

it("shows progress when the Google form is submitted", async () => {
  await render(GoogleButton);
  const form = host.querySelector("form")!;
  form.addEventListener("submit", (event) => event.preventDefault());
  await act(async () => {
    form.requestSubmit();
  });
  expect(host.textContent).toContain("Connecting");
  expect(host.querySelector("button")?.disabled).toBe(true);
});
it("cancels the auth-provider status request when its form leaves the page", async () => {
  await render(GoogleButton);
  const request = vi
    .mocked(fetch)
    .mock.calls.find(([url]) => url === "/api/system/status?scope=auth")!;
  const signal = request[1]?.signal;
  expect(signal?.aborted).toBe(false);
  await act(async () => root.render(null));
  expect(signal?.aborted).toBe(true);
});
it("offers email recovery without advertising a protected guest preview", async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ authProviders: { reachable: true, google: false } }),
  } as Response);
  await render(GoogleButton);
  expect(host.querySelector("button")?.disabled).toBe(true);
  expect(host.textContent).toContain("Use the email form below to continue");
  expect(host.querySelector("a")).toBeNull();
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

it("offers real links, focuses the first link, and restores focus on Escape", async () => {
  await render(AccountMenu);
  await click("Account menu");
  const firstLink = host.querySelector('a[href="/settings"]');
  expect(document.activeElement).toBe(firstLink);
  expect(host.querySelector('a[href="/saved"]')).not.toBeNull();
  expect(host.querySelector('a[href="/settings"]')).not.toBeNull();
  expect(host.querySelector('a[href="/tools"]')).not.toBeNull();
  expect(host.querySelector('a[href="/scan?sort=score"]')).toBeNull();
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(host.querySelector('[aria-label="Account navigation"]')).toBeNull();
  expect(document.activeElement?.getAttribute("aria-label")).toBe(
    "Account menu",
  );
});

it("closes on an outside touch/pointer without trapping page scrolling", async () => {
  await render(AccountMenu);
  await click("Account menu");
  expect(
    host.querySelector('[aria-label="Account navigation"]'),
  ).not.toBeNull();
  await act(async () => {
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  });
  expect(host.querySelector('[aria-label="Account navigation"]')).toBeNull();
});
