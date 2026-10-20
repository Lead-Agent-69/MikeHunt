import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { completeSale } from "@/lib/outcomes/ledger.fixture";
import type { LedgerRow } from "@/lib/outcomes/ledger";
import type { InventoryItem } from "@/lib/data/inventory-service";
const state = vi.hoisted(() => ({
  rows: [] as LedgerRow[],
  error: null as Error | null,
  retry: vi.fn(),
}));
vi.mock("swr", () => ({
  default: () => ({
    data: { outcomes: state.rows },
    error: state.error,
    isLoading: false,
    mutate: state.retry,
  }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
import { FleetKPIs } from "@/components/fleet/FleetKPIs";
let host: HTMLDivElement, root: Root;
const fleet = [
  { id: "sold", stage: "sold", soldPrice: 20000, totalCost: 1000 },
  { id: "active", stage: "recon", totalCost: 2000 },
  { id: "wholesale", stage: "wholesale", totalCost: 9000 },
] as InventoryItem[];
const metric = (label: string) =>
  Array.from(host.querySelectorAll("span")).find(
    (e) => e.textContent === label,
  )!.parentElement!.textContent;
async function render() {
  await act(async () => root.render(<FleetKPIs fleet={fleet} />));
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.rows = [];
  state.error = null;
  state.retry.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
describe("Pipeline reviewed results", () => {
  it("never substitutes inventory spread for reviewed net and excludes wholesale from active capital", async () => {
    state.rows = [
      completeSale({ inventory_id: "sold", costs_complete: false }),
    ];
    await render();
    expect(metric("Avg recorded net")).toContain("—");
    expect(metric("Avg days to sell")).toContain("—");
    expect(metric("Capital deployed")).toContain("$2,000");
    expect(metric("In pipeline")).toContain("1");
    expect(host.textContent).not.toContain("$19,000");
  });
  it("uses latest reviewed costs including a zero-proceeds loss, excluding unrelated outcomes", async () => {
    state.rows = [
      completeSale({ inventory_id: "sold", updated_at: "2026-10-01" }),
      completeSale({
        inventory_id: "sold",
        sell_price: 0,
        updated_at: "2026-10-02",
      }),
      completeSale({ inventory_id: "not-in-fleet", sell_price: 99999 }),
    ];
    await render();
    expect(metric("Avg recorded net")).toContain("-$13,820");
    expect(metric("Avg recorded net")).toContain("1 reviewed sale");
    expect(metric("Avg days to sell")).toContain("30d");
  });
  it("hides stale net metrics on history failure and provides retry", async () => {
    state.rows = [completeSale({ inventory_id: "sold" })];
    state.error = new Error("offline");
    await render();
    expect(metric("Avg recorded net")).toContain("—");
    const retry = host.querySelector<HTMLButtonElement>("button")!;
    await act(async () => retry.click());
    expect(state.retry).toHaveBeenCalledOnce();
  });
});
