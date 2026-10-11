import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("@/lib/reco/client", () => ({
  sendDealSignal: (i: unknown) => send(i),
  // Component reads the prompt via the shared helper; still hits global fetch under the hood.
  fetchSimilarPrompt: async () => {
    try {
      const res = await fetch("/api/reco/prompt", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
}));

import {
  SimilarInterestPrompt,
  PROMPT_AFTER_DWELL_MS,
} from "@/components/reco/SimilarInterestPrompt";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const PROMPT = {
  facet: "model:honda|civic",
  label: "Honda Civic",
  basedOnListings: 3,
  message:
    "You looked at 3 Honda Civic listings in the last day. Want more like these?",
};

let root: Root;
let el: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
const flush = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};
const mount = (enabled = true) =>
  act(() =>
    root.render(
      React.createElement(SimilarInterestPrompt, { dealId: "d1", enabled }),
    ),
  );
const advance = async (ms: number) => {
  await act(async () => {
    vi.advanceTimersByTime(ms);
  });
  await flush();
};
const respond = (status: number, body: unknown) =>
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });

beforeEach(() => {
  vi.useFakeTimers();
  send.mockReset();
  sessionStorage.clear();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => "visible",
  });
  el = document.createElement("div");
  document.body.appendChild(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("SimilarInterestPrompt", () => {
  it("asks only after enough dwell, then shows the backend's message", async () => {
    respond(200, { prompt: PROMPT });
    mount();
    await advance(PROMPT_AFTER_DWELL_MS - 1);
    expect(fetchMock).not.toHaveBeenCalled();
    await advance(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/reco/prompt",
      expect.anything(),
    );
    expect(document.body.textContent).toContain(PROMPT.message);
    const prompt = el.querySelector('[data-testid="reco-similar-prompt"]')!;
    expect(prompt).not.toBeNull();
    expect(prompt.className).not.toContain("fixed");
  });

  it("sends interest_yes / interest_no through the client", async () => {
    respond(200, { prompt: PROMPT });
    mount();
    await advance(PROMPT_AFTER_DWELL_MS);
    const yes = Array.from(document.body.querySelectorAll("button")).find((b) =>
      /Yes, more like these/.test(b.textContent || ""),
    )!;
    act(() => yes.click());
    expect(send).toHaveBeenCalledWith({
      kind: "interest_yes",
      facet: PROMPT.facet,
    });
    expect(document.body.textContent).toContain("For You will lean toward");
  });

  it("closing sends nothing and stays closed this session", async () => {
    respond(200, { prompt: PROMPT });
    mount();
    await advance(PROMPT_AFTER_DWELL_MS);
    const close = document.body.querySelector(
      'button[aria-label="Close"]',
    ) as HTMLElement;
    act(() => close.click());
    expect(send).not.toHaveBeenCalled();
    expect(
      document.querySelector("[data-testid=reco-similar-prompt]"),
    ).toBeNull();
    act(() => root.unmount());
    root = createRoot(el);
    mount();
    await advance(PROMPT_AFTER_DWELL_MS);
    expect(
      document.querySelector("[data-testid=reco-similar-prompt]"),
    ).toBeNull();
  });

  it.each([
    ["401", 401, { error: "Sign in required" }],
    ["null prompt", 200, { prompt: null }],
    ["bad facet", 200, { prompt: { ...PROMPT, facet: "make:<x>" } }],
  ])("shows nothing on %s", async (_n, status, body) => {
    respond(status as number, body);
    mount();
    await advance(PROMPT_AFTER_DWELL_MS);
    expect(
      document.querySelector("[data-testid=reco-similar-prompt]"),
    ).toBeNull();
  });

  it("shows nothing when the request throws, and never asks for guests", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    mount();
    await advance(PROMPT_AFTER_DWELL_MS);
    expect(
      document.querySelector("[data-testid=reco-similar-prompt]"),
    ).toBeNull();
    act(() => root.unmount());
    fetchMock.mockReset();
    root = createRoot(el);
    mount(false);
    await advance(PROMPT_AFTER_DWELL_MS * 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
