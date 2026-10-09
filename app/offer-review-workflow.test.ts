import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
vi.mock("@/components/brand/MikeHuntLoader", () => ({
  MikeHuntLoader: () => null,
}));
import DealCheck from "./(dashboard)/deal-check/page";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(React.createElement(DealCheck)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function fill(index: number, value: string) {
  await act(async () => {
    const input = host.querySelectorAll<HTMLInputElement>(
      'input[type="number"]',
    )[index];
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
describe("offer-review task", () => {
  it("checks manual offer amounts without an AI key or request and exposes planning next steps", async () => {
    const values = ["18000", "300", "0", "1200", "19500"];
    for (let index = 0; index < values.length; index++)
      await fill(index, values[index]);
    await submit();
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Quoted total matches");
    expect(host.querySelector('a[href="/fleet"]')).not.toBeNull();
  });
  it("shows incomplete costs instead of turning blanks into zeros", async () => {
    await fill(0, "18000");
    await submit();
    expect(host.textContent).toContain("Incomplete: selling price or taxes");
    expect(host.textContent).not.toContain("Quoted total matches");
  });
  it("validates negative costs and preserves inputs", async () => {
    await fill(0, "18000");
    await fill(3, "-1");
    await submit();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("18000");
  });
  it("gives offer-specific recovery when document reading fails", async () => {
    request.mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Couldn't read the document. Try a clearer photo.",
      }),
    });
    await act(async () =>
      Array.from(host.querySelectorAll("button"))
        .find((button) => button.textContent?.includes("Read offer"))!
        .click(),
    );
    await act(async () => {
      const input = host.querySelector("textarea")!;
      Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!.call(input, "Dealer quote");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await submit();
    expect(host.textContent).toContain(
      "selling price, itemized fees, taxes and quoted total",
    );
    expect(host.textContent).not.toContain("year, make, model");
    expect(host.querySelector("textarea")?.value).toBe("Dealer quote");
  });
});
