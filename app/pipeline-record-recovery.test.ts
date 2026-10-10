import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock("swr", () => ({
  default: () => ({
    data: {
      items: [
        {
          id: "unit",
          stage: "offer",
          year: 2020,
          make: "Honda",
          model: "Civic",
          vin: "",
          floorDate: new Date().toISOString(),
          dailyFloorRate: 35,
          totalCost: 1000,
          purchasePrice: 1000,
          repairCost: 100,
          listPrice: 2000,
        },
      ],
    },
    isLoading: false,
    mutate: mocks.mutate,
  }),
}));
vi.mock("@/lib/supabase", () => ({ isSupabaseConfigured: () => true }));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
vi.mock("@/components/fleet/FleetKPIs", () => ({ FleetKPIs: () => null }));
vi.mock("@/components/fleet/CapitalVelocityTracker", () => ({
  CapitalVelocityTracker: () => null,
}));
import FleetPage from "./(dashboard)/fleet/page";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  mocks.mutate.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.open = false;
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(React.createElement(FleetPage)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  )!;
  await act(async () => {
    button.focus();
    button.click();
  });
  return button;
}
async function fill(value: string) {
  const input = host.querySelector<HTMLInputElement>("dialog input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
describe("Pipeline sale and expense handoffs", () => {
  it("routes Advance to Sold through a blank actual-price confirmation without a write", async () => {
    const opener = await click("Advance to Sold");
    expect(request).not.toHaveBeenCalled();
    expect(host.querySelector("dialog")?.getAttribute("aria-label")).toBe(
      "Record vehicle sale",
    );
    expect(host.querySelector<HTMLInputElement>("dialog input")?.value).toBe(
      "",
    );
    await act(async () =>
      host
        .querySelector("dialog")!
        .dispatchEvent(new Event("cancel", { cancelable: true })),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
  it("retains sale input and never updates the card on HTTP failure", async () => {
    await click("Mark Sold");
    await fill("1500");
    request.mockResolvedValue({
      ok: false,
      json: async () => ({ item: { id: "unit", stage: "sold" } }),
    });
    await click("Confirm Sale");
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("dialog input")?.value).toBe(
      "1500",
    );
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("accepts explicitly entered zero, but does not accept another row's confirmation", async () => {
    await click("Mark Sold");
    await fill("0");
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: "other", stage: "sold" } }),
    });
    await click("Confirm Sale");
    expect(JSON.parse(request.mock.calls[0][1].body).soldPrice).toBe(0);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("sends category, actual amount and expected recorded total without an unsaved note field", async () => {
    await click("Log Expense");
    await fill("25.55");
    request.mockResolvedValue({
      ok: true,
      json: async () => ({ item: { id: "unit", stage: "offer" } }),
    });
    await click("Save Expense");
    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
      id: "unit",
      expense: { category: "repair", amount: 25.55, expectedTotal: 100 },
    });
    expect(mocks.mutate).toHaveBeenCalledOnce();
    expect(host.querySelector("dialog")).toBeNull();
  });
});
