import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mode: "personal",
  dealerId: "user-one" as string | null,
  loading: false,
  replace: vi.fn(),
  refresh: vi.fn(),
  signOut: vi.fn(),
  errorToast: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) =>
    React.createElement("a", props, children),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: mocks.mode } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: mocks.dealerId, loading: mocks.loading }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createClientComponentClient: () => ({ auth: { signOut: mocks.signOut } }),
}));
vi.mock("sonner", () => ({ toast: { error: mocks.errorToast } }));
import { AccountMenu } from "@/components/home/AccountMenu";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.clearAllMocks();
  mocks.mode = "personal";
  mocks.dealerId = "user-one";
  mocks.loading = false;
  mocks.signOut.mockResolvedValue({ error: null });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function open() {
  await act(async () =>
    root.render(React.createElement(AccountMenu, { floating: false })),
  );
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
}

describe("Account navigation", () => {
  it("keeps account actions compact and focuses native links, with Escape returning to its trigger", async () => {
    mocks.mode = "dealer";
    await open();
    expect(
      Array.from(host.querySelectorAll("nav a"), (a) => a.textContent?.trim()),
    ).toEqual([
      "Settings",
      "Upgrade",
      "Help & updates",
      "Buying profile",
      "Saved",
      "Saved searches",
      "Alerts",
      "All tools",
    ]);
    expect(document.activeElement).toBe(
      host.querySelector('a[href="/settings"]'),
    );
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(host.querySelector("nav")).toBeNull();
    expect(document.activeElement).toBe(host.querySelector("button"));
  });

  it("does not offer logout before authentication is known", async () => {
    mocks.loading = true;
    await open();
    expect(host.textContent).toContain("Checking account");
    expect(host.textContent).not.toContain("Log out");
    expect(host.textContent).not.toContain("Sign in");
  });

  it("announces a protected help destination to signed-out users", async () => {
    mocks.dealerId = null;
    await open();
    expect(
      host.querySelector('a[href="/login?next=%2Fchangelog"]')?.textContent,
    ).toContain("sign in required");
    expect(host.querySelector('a[href="/tools"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Log out");
  });

  it("keeps the account open and reports a failed logout instead of pretending it succeeded", async () => {
    mocks.signOut.mockResolvedValue({ error: new Error("private auth error") });
    await open();
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("Log out"))!
        .click(),
    );
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not log out",
    );
    expect(host.textContent).not.toContain("private auth error");
    expect(host.querySelector("nav")).not.toBeNull();
  });

  it("returns to login and refreshes server state only after confirmed logout", async () => {
    await open();
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((b) => b.textContent?.includes("Log out"))!
        .click(),
    );
    expect(mocks.replace).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
    expect(host.querySelector("nav")).toBeNull();
  });
});
