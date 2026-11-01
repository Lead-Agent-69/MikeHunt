import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("framer-motion", async () => {
  const react = await import("react");
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      div: react.forwardRef<HTMLDivElement, Record<string, unknown>>(
        ({ children, ...props }, ref) =>
          react.createElement(
            "div",
            {
              ...Object.fromEntries(
                Object.entries(props).filter(
                  ([key]) => !["initial", "animate", "exit"].includes(key),
                ),
              ),
              ref,
            },
            children as React.ReactNode,
          ),
      ),
    },
  };
});
import { CashOfferLetterModal } from "@/components/deal/CashOfferLetterModal";

let host: HTMLDivElement, root: Root;
const copy = vi.fn();
const close = vi.fn();
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);
const vehicle = {
  id: "car-a",
  year: 2023,
  make: "Kia",
  model: "K5",
  askPrice: 2180,
  targetOffer: 1900,
  recommendedMaxBid: 2500,
};
const render = (deal = vehicle) =>
  act(async () =>
    root.render(<CashOfferLetterModal isOpen onClose={close} deal={deal} />),
  );
const button = (text: string) =>
  Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) => item.textContent?.trim() === text,
  )!;
const amount = () =>
  document.querySelector<HTMLInputElement>("#cash-offer-amount")!;
async function enter(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(amount(), value);
    amount().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ profile: null }) }),
  );
  copy.mockReset().mockResolvedValue(undefined);
  close.mockReset();
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: copy },
  });
  vi.spyOn(window, "print").mockImplementation(() => {});
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  if (originalClipboard)
    Object.defineProperty(navigator, "clipboard", originalClipboard);
  else Reflect.deleteProperty(navigator, "clipboard");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("owner-chosen cash offer draft", () => {
  it("does not turn advertised prices, legacy targets or ceilings into an offer", async () => {
    await render();
    expect(amount().value).toBe("");
    expect(button("Copy for SMS").disabled).toBe(true);
    expect(button("Print / Save PDF").disabled).toBe(true);
    expect(document.body.textContent).toContain("[Enter your offer]");
    expect(document.body.textContent).not.toContain("Current Asking Price");
    expect(document.body.textContent).not.toContain("$2,180");
    expect(document.activeElement).toBe(amount());
    await render({
      ...vehicle,
      id: "no-price",
      askPrice: 0,
      targetOffer: 0,
      recommendedMaxBid: 0,
    });
    expect(amount().value).toBe("");
    expect(document.body.textContent).not.toContain("$5,000");
  });
  it("copies only an explicitly entered valid amount", async () => {
    await render();
    await enter("0");
    expect(button("Copy for SMS").disabled).toBe(true);
    await enter("12000");
    await act(async () => button("Copy for SMS").click());
    expect(copy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining("offer $12,000 cash"),
    );
    expect(button("Copied Text")).toBeDefined();
    await enter("13000");
    expect(button("Copy for SMS")).toBeDefined();
  });
  it("retains edits and reports clipboard failure instead of claiming success", async () => {
    copy.mockRejectedValueOnce(new Error("clipboard denied"));
    await render();
    await enter("8000");
    await act(async () => button("Copy for SMS").click());
    expect(document.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be copied",
    );
    expect(amount().value).toBe("8000");
    expect(button("Copied Text")).toBeUndefined();
    await act(async () => button("Copy for SMS").click());
    expect(button("Copied Text")).toBeDefined();
  });
  it("does not reuse a different vehicle's offer or copied state", async () => {
    await render();
    await enter("9000");
    await act(async () => button("Copy for SMS").click());
    await render({ ...vehicle, id: "car-b", model: "Sorento" });
    expect(amount().value).toBe("");
    expect(button("Copy for SMS").disabled).toBe(true);
    expect(button("Copied Text")).toBeUndefined();
  });
});
