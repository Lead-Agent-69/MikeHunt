import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const account = vi.hoisted(() => ({ owner: "one" as string | null }));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: account.owner, loading: false }),
}));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "reseller" } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import ReconPage from "./(dashboard)/recon/page";

let root: Root;
let host: HTMLDivElement;
let fetch: ReturnType<typeof vi.fn>;
let element: React.ReactElement;
const row = (owner: string, model: string) => ({
  id: `${owner}-unit`,
  dealerId: owner,
  year: 2020,
  make: "Honda",
  model,
  vin: "",
  stage: "recon",
  floorDate: new Date().toISOString(),
  dailyFloorRate: 35,
  repairCost: 0,
});
const response = (owner: string, model: string) =>
  Response.json({
    ownerId: owner,
    items: [row(owner, model)],
    total: 1,
    hasMore: false,
  });
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  account.owner = "one";
  fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  element = React.createElement(
    SWRConfig,
    {
      value: {
        provider: () => new Map(),
        dedupingInterval: 0,
        shouldRetryOnError: false,
      },
    },
    React.createElement(ReconPage),
  );
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => {
    root.render(
      React.cloneElement(element, {}, React.createElement(ReconPage)),
    );
  });
}
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
}
describe("Recon account and connection recovery", () => {
  it("does not display the previous account's delayed response after switching or signing out", async () => {
    let finish!: (value: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await render();
    account.owner = "two";
    fetch.mockResolvedValueOnce(response("two", "Current account vehicle"));
    await render();
    await settle();
    expect(host.textContent).toContain("Current account vehicle");
    await act(async () => finish(response("one", "Previous account vehicle")));
    await settle();
    expect(host.textContent).not.toContain("Previous account vehicle");
    account.owner = null;
    await render();
    expect(host.textContent).not.toContain("Current account vehicle");
    expect(host.querySelector('a[href="/login"]')?.textContent).toContain(
      "Sign in",
    );
  });
  it("clears a failed load when Retry succeeds without reloading the whole page", async () => {
    fetch.mockResolvedValueOnce(
      Response.json({ error: "unavailable" }, { status: 500 }),
    );
    await render();
    await settle();
    expect(host.textContent).toContain("Couldn't load recon data");
    fetch.mockResolvedValueOnce(response("one", "Recovered vehicle"));
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click();
    });
    await settle();
    expect(host.textContent).toContain("Recovered vehicle");
    expect(host.textContent).not.toContain("Couldn't load recon data");
  });
  it("does not remove a current account card on a previous account's late stage confirmation", async () => {
    fetch.mockResolvedValueOnce(response("one", "Previous account vehicle"));
    await render();
    await settle();
    let finish!: (value: Response) => void;
    fetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click();
    });
    expect(fetch.mock.calls[1][1].headers["x-inventory-owner"]).toBe("one");
    account.owner = "two";
    fetch.mockResolvedValueOnce(response("two", "Current account vehicle"));
    await render();
    await settle();
    await act(async () =>
      finish(
        Response.json({
          ownerId: "one",
          item: { ...row("one", "Previous account vehicle"), stage: "listed" },
        }),
      ),
    );
    expect(host.textContent).toContain("Current account vehicle");
    expect(host.textContent).not.toContain("Previous account vehicle");
  });
});
