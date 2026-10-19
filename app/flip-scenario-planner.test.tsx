import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MaxBidWidget } from "@/components/deal/MaxBidWidget";
import {
  emptyScenario,
  type ScenarioDraft,
  type ScenarioField,
} from "@/lib/scoring/flip-scenario";
let root: Root;
let host: HTMLDivElement;
const base = {
  dealId: "car",
  ownerId: "buyer",
  askPrice: 10000,
  source: "cars_com",
  sourceUrl: "https://www.cars.com/vehicledetail/123/",
  lastSeenAt: new Date().toISOString(),
  priceEvidence: { kind: "asking" as const, askingPrice: 10000 },
  sellEstimate: 16000,
};
const complete: ScenarioDraft = {
  purchase: "10000",
  resale: "16000",
  buyerFees: "500",
  buyerFeeRate: "5",
  taxTitle: "500",
  repair: "1000",
  transport: "300",
  holding: "200",
  sellingFees: "100",
  sellingFeeRate: "2",
  otherCosts: "400",
  targetProfit: "2000",
};
const key = "mikehunt:flip-scenario:v1:buyer:car";
const buttons = () => Array.from(host.querySelectorAll("button"));
const button = (text: string) =>
  buttons().find((el) => el.textContent?.includes(text))!;
const render = async (
  props: React.ComponentProps<typeof MaxBidWidget> = base,
) => act(async () => root.render(<MaxBidWidget {...props} />));
async function enter(field: ScenarioField, value: string) {
  const input = host.querySelector<HTMLInputElement>(
    `[data-scenario-field="${field}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("flip scenario planner", () => {
  it("starts with unknown costs and copies a cash price only on request", async () => {
    await render();
    expect(host.querySelector('[data-testid="scenario-profit"]')).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="purchase"]')!
        .value,
    ).toBe("");
    await act(async () => button("Use asking price").click());
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="purchase"]')!
        .value,
    ).toBe("10000");
    expect(buttons().some((b) => b.textContent === "Use resale estimate")).toBe(
      false,
    );
    expect(host.textContent).toContain("Resale needs comparable evidence");
  });
  it.each([
    "down_payment",
    "monthly_payment",
    "finance_teaser",
    "current_bid",
    "reference",
    "unknown",
  ] as const)("does not use %s as the purchase price", async (kind) => {
    await render({ ...base, priceEvidence: { kind } });
    expect(buttons().some((b) => b.textContent?.startsWith("Use "))).toBe(
      false,
    );
  });
  it("does not copy stale price observations", async () => {
    await render({ ...base, lastSeenAt: "2000-01-01T00:00:00Z" });
    expect(buttons().some((b) => b.textContent?.startsWith("Use "))).toBe(
      false,
    );
  });
  it("calculates from entered costs, hides output after clearing one cost, and validates input", async () => {
    await render();
    for (const [field, value] of Object.entries(complete))
      await enter(field as ScenarioField, value);
    expect(
      host.querySelector('[data-testid="scenario-profit"]')!.textContent,
    ).toBe("$2,180");
    expect(
      host.querySelector('[data-testid="scenario-ceiling"]')!.textContent,
    ).toBe("$10,171.42");
    await enter("holding", "");
    expect(host.querySelector('[data-testid="scenario-profit"]')).toBeNull();
    await enter("holding", "-1");
    expect(host.querySelector('[aria-invalid="true"]')).not.toBeNull();
    expect(button("Save draft").disabled).toBe(true);
  });
  it("saves explicitly, restores by account and listing, and clears saved drafts", async () => {
    await render();
    await enter("repair", "500");
    expect(localStorage.getItem(key)).toBeNull();
    await act(async () => button("Save draft").click());
    expect(JSON.parse(localStorage.getItem(key)!).draft.repair).toBe("500");
    await render({ ...base, ownerId: "other-buyer" });
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="repair"]')!
        .value,
    ).toBe("");
    await render();
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="repair"]')!
        .value,
    ).toBe("500");
    await act(async () => button("Clear scenario").click());
    expect(localStorage.getItem(key)).toBeNull();
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="repair"]')!
        .value,
    ).toBe("");
  });
  it("retains user edits when a reference refreshes", async () => {
    await render();
    await enter("purchase", "9000");
    await render({ ...base, askPrice: 12000, sellEstimate: 18000 });
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="purchase"]')!
        .value,
    ).toBe("9000");
  });
  it("reports storage failure without claiming the draft was saved", async () => {
    await render();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await enter("repair", "500");
    await act(async () => button("Save draft").click());
    expect(host.querySelector('[role="alert"]')!.textContent).toContain(
      "could not save",
    );
    expect(
      host.querySelector<HTMLInputElement>('[data-scenario-field="repair"]')!
        .value,
    ).toBe("500");
  });
  it("ignores malformed saved drafts", async () => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, savedAt: "bad", draft: emptyScenario() }),
    );
    await render();
    expect(host.textContent).toContain("Not saved.");
  });
});
