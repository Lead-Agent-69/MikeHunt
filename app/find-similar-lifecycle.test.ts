import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FindSimilarModal } from "@/components/saved/FindSimilarModal";

vi.mock("next/link", () => ({ default: "a" }));

const snapshot = { vin: "", year: 2020, make: "Acura", model: "MDX" };
let root: Root;
let container: HTMLDivElement;
const fetchMock = vi.fn();

async function render(open = true) {
  await act(async () => {
    root.render(
      React.createElement(FindSimilarModal, {
        isOpen: open,
        onClose: vi.fn(),
        snapshot,
      }),
    );
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("similar listing request lifecycle", () => {
  it("shows friendly failure and retries without fabricated data", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await render();
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "Please try again",
    );
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          id: "example",
          year: 2020,
          make: "Acura",
          model: "MDX",
          ask_price: null,
        },
      ],
    });
    const retry = Array.from(document.querySelectorAll("button")).find(
      (button) => button.textContent === "Try again",
    )!;
    await act(async () => retry.click());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(document.querySelector('[role="alert"]')).toBeNull();
    expect(document.body.textContent).toContain("No photo");
    expect(document.body.textContent).toContain("Price not provided");
    expect(document.querySelector("img")).toBeNull();
    log.mockRestore();
  });

  it("aborts closing requests, restores scroll, and ignores older results", async () => {
    let resolveOld!: (value: unknown) => void;
    fetchMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    document.body.style.overflow = "auto";
    await render();
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    expect(document.body.style.overflow).toBe("hidden");
    await render(false);
    expect(signal.aborted).toBe(true);
    expect(document.body.style.overflow).toBe("auto");
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => [] });
    await render();
    await act(async () =>
      resolveOld({
        ok: true,
        json: async () => [{ id: "old", make: "STALE" }],
      }),
    );
    expect(document.body.textContent).toContain("No similar listings yet");
    expect(document.body.textContent).not.toContain("STALE");
  });
});
