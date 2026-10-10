import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  getUser: vi.fn(),
  updateUser: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  createClientComponentClient: () => ({ auth }),
  isSupabaseConfigured: () => true,
}));
vi.mock("@/components/brand/MikeHuntLogo", () => ({
  MikeHuntLogo: () => null,
}));
import ResetPassword from "./(auth)/reset-password/page";
import ForgotPassword from "./(auth)/forgot-password/page";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  window.history.replaceState({}, "", "/reset-password");
  auth.getUser.mockResolvedValue({
    data: { user: { id: "own-user" } },
    error: null,
  });
  auth.updateUser.mockResolvedValue({
    data: { user: { id: "own-user" } },
    error: null,
  });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
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
function fill(index: number, value: string) {
  const input = host.querySelectorAll("input")[index];
  act(() => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

describe("password recovery", () => {
  it("requests a recovery callback without claiming the email exists", async () => {
    await render(ForgotPassword);
    fill(0, "buyer@example.com");
    await submit();
    expect(auth.resetPasswordForEmail).toHaveBeenCalledWith(
      "buyer@example.com",
      {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      },
    );
    expect(host.textContent).toContain("If an account exists");
  });
  it("recovers from network failure without leaving Send disabled", async () => {
    auth.resetPasswordForEmail.mockRejectedValueOnce(
      new Error("network private details"),
    );
    await render(ForgotPassword);
    fill(0, "buyer@example.com");
    await submit();
    expect(host.textContent).toContain("Check your connection");
    expect(host.textContent).not.toContain("private details");
    expect(
      host.querySelector("button[type=submit]")?.hasAttribute("disabled"),
    ).toBe(false);
  });
  it("does not expose the update form without a verified user", async () => {
    auth.getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    await render(ResetPassword);
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).toContain("Request a new reset link");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("refuses expired callback links even with an existing session", async () => {
    window.history.replaceState({}, "", "/reset-password?error=expired");
    await render(ResetPassword);
    expect(host.querySelector("form")).toBeNull();
    expect(auth.getUser).not.toHaveBeenCalled();
  });
  it("checks length and confirmation before calling the provider", async () => {
    await render(ResetPassword);
    fill(0, "short");
    fill(1, "short");
    await submit();
    expect(host.textContent).toContain("at least 12 characters");
    fill(0, "test-only-long-password");
    fill(1, "different-test-password");
    await submit();
    expect(host.textContent).toContain("do not match");
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
  it("shows completion only after a successful update", async () => {
    await render(ResetPassword);
    fill(0, "test-only-long-password");
    fill(1, "test-only-long-password");
    auth.updateUser.mockResolvedValueOnce({
      error: { message: "private error" },
    });
    await submit();
    expect(host.textContent).not.toContain("Your password has been updated");
    expect(host.querySelector("form")).not.toBeNull();
    await submit();
    expect(auth.updateUser).toHaveBeenCalledWith({
      password: "test-only-long-password",
    });
    expect(host.textContent).toContain("Your password has been updated");
    expect(host.querySelector("input")).toBeNull();
  });
  it("uses theme-aware field and autofill colors", () => {
    const css = readFileSync("app/globals.css", "utf8");
    const field = css.split(".field {")[1].split(".field:focus")[0];
    expect(field).toContain("background: var(--s0)");
    expect(field).not.toContain("#fffdf8");
    expect(field).toContain("-webkit-text-fill-color: var(--t1)");
    expect(field).toContain("caret-color: var(--t1)");
  });
});
