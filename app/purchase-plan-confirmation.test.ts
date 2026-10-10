import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("swr", () => ({
  default: () => ({
    data: [
      {
        id: "save",
        deal_id: null,
        status: "active",
        tags: [],
        snapshot: { make: "Honda", model: "Civic" },
      },
    ],
    mutate: mocks.mutate,
  }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));
import { PurchasePipeline } from "@/components/saved/PurchasePipeline";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.mutate.mockClear();
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(React.createElement(PurchasePipeline)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function completeTask() {
  await act(async () =>
    host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click(),
  );
}
describe("purchase planning", () => {
  it("exposes next task, progress and useful handoffs without a dead detail URL", () => {
    expect(host.textContent).toContain("Next: Ask seller about condition");
    expect(host.textContent).toContain("0 of 5 tasks");
    expect(host.querySelector('a[href*="/deal/"]')).toBeNull();
    expect(host.querySelector('a[href="/move"]')).not.toBeNull();
  });
  it("does not refresh as saved when the response confirms another row", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "wrong",
        status: "active",
        tags: ["purchase-task:0"],
      }),
    });
    await completeTask();
    expect(mocks.mutate).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "not confirmed",
    );
    expect(host.querySelector<HTMLInputElement>("input")?.checked).toBe(false);
  });
  it("refreshes only after the matching status and exact task tags are confirmed", async () => {
    request.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "save",
        status: "active",
        tags: ["purchase-task:0"],
      }),
    });
    await completeTask();
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});
