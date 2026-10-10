import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children }: { children: React.ReactNode }) =>
      React.createElement("div", null, children),
  },
}));
vi.mock("@/components/deal/AcquireToPipelineButton", () => ({
  AcquireToPipelineButton: () => null,
}));
vi.mock("@/components/deal/CashOfferLetterModal", () => ({
  CashOfferLetterModal: () => null,
}));
import BestBuyPage from "./(dashboard)/best-buy/page";

let root: Root;
let host: HTMLDivElement;
const request = vi.fn();
const car = (id: string) => ({
  id,
  title: `Car ${id}`,
  askPrice: 5000,
  images: [],
  evidence: { acquisitionReady: false, nextCheck: "Verify condition" },
});
const payload = (bestBuy: unknown, runnerUps: unknown[] = []) => ({
  bestBuy,
  runnerUps,
  stats: { totalConsidered: 2 },
});
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", request);
  request.mockReset();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const render = () =>
  act(async () => {
    root.render(React.createElement(BestBuyPage));
  });
const button = (label: string) =>
  Array.from(host.querySelectorAll("button")).find(
    (item) => item.textContent?.trim() === label,
  )!;

describe("one intentional ranked recommendation workflow", () => {
  it("renders the best candidate and alternatives exactly once, from one request", async () => {
    request.mockResolvedValue(
      response(payload(car("a"), [car("a"), car("b")])),
    );
    await render();
    expect(request).toHaveBeenCalledTimes(1);
    expect(
      Array.from(host.querySelectorAll("h3")).map((item) => item.textContent),
    ).toEqual(["Car a", "Car b"]);
    expect(host.textContent).toContain("Candidate #1");
    expect(host.textContent).not.toContain("Projected net");
    expect(
      host
        .querySelector('[aria-label="Available capital"]')
        ?.getAttribute("min"),
    ).toBe("0");
  });

  it("distinguishes failure from no matches and allows retry", async () => {
    request
      .mockResolvedValueOnce(response({}, false))
      .mockResolvedValueOnce(response(payload(car("retry"))));
    await render();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load ranked picks",
    );
    expect(host.textContent).not.toContain("No candidates match");
    await act(async () => {
      button("Retry").click();
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(host.textContent).toContain("Car retry");
  });

  it("reports a genuine successful empty result", async () => {
    request.mockResolvedValue(response(payload(null)));
    await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "No candidates match this budget and strategy",
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([
    {},
    payload(null, [null]),
    payload({ id: "bad", askPrice: "5000" }),
    payload({ id: "bad", images: "not-an-array" }),
  ])(
    "rejects malformed successful responses without an invented empty result",
    async (body) => {
      request.mockResolvedValue(response(body));
      await render();
      expect(host.querySelector('[role="alert"]')).not.toBeNull();
      expect(host.textContent).not.toContain("No candidates match");
    },
  );

  it("aborts changed budgets, hides stale picks and ignores late results", async () => {
    const old = deferred();
    const latest = deferred();
    request
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(latest.promise);
    await render();
    await act(async () => {
      button("$5k").click();
    });
    expect(request.mock.calls[1][0]).toContain("capital=5000");
    expect(request.mock.calls[0][1].signal.aborted).toBe(true);
    expect(host.querySelector('[role="status"]')?.textContent).toContain(
      "Loading ranked picks",
    );
    await act(async () => {
      latest.resolve(response(payload(car("latest"))));
    });
    await act(async () => {
      old.resolve(response(payload(car("old"))));
    });
    expect(host.textContent).toContain("Car latest");
    expect(host.textContent).not.toContain("Car old");
    request.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => {
      button("Max Cash ($)").click();
    });
    expect(request.mock.calls[2][0]).toContain("strategy=max_profit");
    expect(host.textContent).not.toContain("Car latest");
  });
});
