import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), updateUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createClientComponentClient: () => ({ auth: mocks }),
}));
import ResetPasswordPage from "./(auth)/reset-password/page";

let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/reset-password");
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
  mocks.updateUser.mockResolvedValue({
    data: { user: { id: "owner" } },
    error: null,
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function mount() {
  await act(async () => root.render(React.createElement(ResetPasswordPage)));
}
async function fill(password: string, confirmation = password) {
  const inputs = container.querySelectorAll("input");
  await act(async () => {
    [password, confirmation].forEach((value, index) => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(inputs[index], value);
      inputs[index].dispatchEvent(new Event("input", { bubbles: true }));
    });
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
describe("new password screen", () => {
  it("hides the form for invalid links even with an existing session", async () => {
    window.history.replaceState({}, "", "/reset-password?error=invalid_link");
    await mount();
    expect(container.querySelector("form")).toBeNull();
    expect(container.textContent).toContain("Request a new reset link");
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("rejects short and mismatched passwords without writes", async () => {
    await mount();
    await fill("short");
    await submit();
    expect(container.textContent).toContain("at least 12");
    await fill("twelve-characters", "different-password");
    await submit();
    expect(container.textContent).toContain("do not match");
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("requires a fresh verified user before updating", async () => {
    await mount();
    await fill("twelve-characters");
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    await submit();
    expect(mocks.updateUser).not.toHaveBeenCalled();
    expect(container.textContent).toContain("session has expired");
  });
  it("confirms success only for the current account and clears the form", async () => {
    await mount();
    await fill("twelve-characters");
    await submit();
    expect(mocks.updateUser).toHaveBeenCalledWith({
      password: "twelve-characters",
    });
    expect(container.textContent).toContain("Your password has been updated");
    expect(container.querySelector("input")).toBeNull();
  });
  it("keeps the form usable after a network failure without a false success", async () => {
    mocks.updateUser.mockRejectedValue(new Error("Failed to fetch"));
    await mount();
    await fill("twelve-characters");
    await submit();
    expect(container.textContent).toContain("Check your connection");
    expect(container.textContent).not.toContain(
      "Your password has been updated",
    );
    expect(container.querySelector("button")!.disabled).toBe(false);
  });
});
