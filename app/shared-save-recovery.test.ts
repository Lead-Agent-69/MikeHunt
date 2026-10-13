import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  params: { text: "https://seller.example/car/1\nGreat truck" } as {
    url?: string;
    text?: string;
    title?: string;
  },
  user: "buyer" as string | null,
  loading: false,
}));
const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }));
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<
    typeof import("react") & { default: typeof import("react") }
  >();
  return { ...react, default: { ...react.default, use: () => state.params } };
});
vi.mock("next/navigation", () => ({ useRouter: () => mocks }));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: state.user, loading: state.loading }),
}));
vi.mock("@/components/brand/MikeHuntLoader", () => ({
  MikeHuntLoader: () => null,
}));
import SavePage from "./(dashboard)/save/page";

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const id = "12345678-1234-4234-8234-123456789abc";
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const render = () =>
  act(async () =>
    root.render(
      React.createElement(SavePage, {
        searchParams: Promise.resolve(state.params),
      }),
    ),
  );

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  fetchMock = vi.fn().mockResolvedValue(response({ dealId: id }));
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  state.params = { text: "https://seller.example/car/1\nGreat truck" };
  state.user = "buyer";
  state.loading = false;
  mocks.replace.mockReset();
  mocks.push.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("shared vehicle save recovery", () => {
  it("posts only the listing URL and navigates to the confirmed vehicle", async () => {
    await render();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      url: "https://seller.example/car/1",
    });
    expect(mocks.replace).toHaveBeenCalledWith(`/deal/${id}`);
    expect(host.textContent).not.toMatch(/profit|scored|analyz/i);
  });
  it.each([
    null,
    "invalid body",
    {},
    { dealId: "undefined" },
    { dealId: "https://evil.example" },
  ])("does not navigate on malformed success: %j", async (body) => {
    fetchMock.mockResolvedValue(response(body));
    await render();
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("couldn't confirm");
    expect(host.textContent).toContain("Try again");
  });
  it("retries the original URL after a failed request", async () => {
    fetchMock.mockResolvedValueOnce(
      response({ error: "Listing temporarily unavailable" }, false),
    );
    await render();
    const button = Array.from(host.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Try again"),
    )!;
    await act(async () => button.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).url).toBe(
      "https://seller.example/car/1",
    );
    expect(mocks.replace).toHaveBeenCalledWith(`/deal/${id}`);
  });
  it("preserves the shared link through sign-in without posting anonymously", async () => {
    state.user = null;
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    const href = host.querySelector("a")!.getAttribute("href")!;
    const next = new URL(href, "https://app.example").searchParams.get("next")!;
    expect(new URL(next, "https://app.example").searchParams.get("url")).toBe(
      "https://seller.example/car/1",
    );
  });
  it("rejects invalid shares without fetching and offers vehicle search", async () => {
    state.params = { url: "http-not-a-link" };
    await render();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(host.textContent).toContain("No valid vehicle link");
    const button = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Find vehicles",
    )!;
    await act(async () => button.click());
    expect(mocks.push).toHaveBeenCalledWith("/scan");
  });
  it("ignores a completed request after sign-out, even if fetch ignores abort", async () => {
    let resolve!: (value: unknown) => void;
    fetchMock.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    await render();
    const signal = fetchMock.mock.calls[0][1].signal;
    state.user = null;
    await render();
    await act(async () => resolve(response({ dealId: id })));
    expect(signal.aborted).toBe(true);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Sign in to save");
  });
});
