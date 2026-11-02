import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  data: null as any,
  error: null as any,
  isLoading: false,
  isValidating: false,
  mutate: vi.fn(async () => undefined),
}));
vi.mock("swr", () => ({ default: () => state }));
import { DealIQCard } from "@/components/deal/DealIQCard";
let cleanup: (() => void) | undefined;
function render() {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<DealIQCard dealId="example" />));
  cleanup = () => {
    act(() => root.unmount());
    host.remove();
  };
  return host;
}
afterEach(() => {
  cleanup?.();
  state.data = null;
  state.error = null;
  state.isLoading = false;
  state.mutate.mockClear();
});
describe("Deal IQ evidence display", () => {
  it("does not render a legacy cached score without explicit evidence readiness", () => {
    state.data = { iq: { score: 99, tier: "elite", signals: [] } };
    const host = render();
    expect(host.textContent).toContain(
      "Profit and a buying score are not established",
    );
    expect(host.textContent).not.toContain("Elite");
    expect(host.textContent).not.toContain("99");
  });
  it("shows source-backed missing checks instead of legacy buying claims", () => {
    state.data = {
      iq: null,
      evidence: {
        label: "Auction watch",
        nextCheck: "Verify final bid and fees.",
        priceMeaning: "Current bid",
        sourceUrl: "https://www.govdeals.com/asset/1/2",
        observedAt: "2026-10-31T00:00:00Z",
      },
    };
    const host = render();
    expect(host.textContent).toContain(
      "Profit and a buying score are not established",
    );
    expect(host.textContent).toContain("Verify final bid and fees");
    expect(host.textContent).not.toContain("payment/lease");
    expect(host.querySelector("time")?.dateTime).toBe("2026-10-31T00:00:00Z");
    expect(host.querySelector("a")?.href).toBe(
      "https://www.govdeals.com/asset/1/2",
    );
  });
  it("offers retry after failure and does not display cached profit", async () => {
    state.error = new Error("private failure");
    state.data = { iq: { score: 90 } };
    const host = render();
    expect(host.textContent).not.toContain("private failure");
    expect(host.textContent).not.toContain("90");
    await act(async () => host.querySelector("button")!.click());
    expect(state.mutate).toHaveBeenCalledOnce();
  });
  it("announces loading without an automatic score", () => {
    state.isLoading = true;
    expect(render().querySelector('[role="status"]')?.textContent).toContain(
      "Checking",
    );
  });
});
