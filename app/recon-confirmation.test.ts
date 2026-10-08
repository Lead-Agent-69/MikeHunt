import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
import Page from "./(dashboard)/recon/page";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
const item = {
  id: "car",
  year: 2020,
  make: "Honda",
  model: "Civic",
  vin: "TEST",
  totalCost: 10000,
  repairCost: 0,
  reconCost: 0,
  dailyFloorRate: 0,
  floorDate: "2026-01-01",
  stage: "recon",
};
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request = vi.fn(async () => ({
    ok: true,
    json: async () => ({ items: [item] }),
  }));
  vi.stubGlobal("fetch", request);
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(React.createElement(Page)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("does not derive repair completion or invented costs from spending", () => {
  expect(host.textContent).not.toContain("Repair Progress");
  expect(host.textContent).toContain("Recorded Repair Cost");
  expect(host.textContent).not.toContain("$1,500");
});
it("rejects an unconfirmed stage update and retains the vehicle", async () => {
  request.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ item: { ...item, id: "other", stage: "listed" } }),
  });
  await act(async () =>
    Array.from(host.querySelectorAll("button"))
      .find((b) => b.textContent?.includes("Complete Recon"))!
      .click(),
  );
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "not confirmed",
  );
  expect(host.textContent).toContain("2020 Honda Civic");
});
