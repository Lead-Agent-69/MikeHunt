import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
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
  vi.useRealTimers();
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
  it.each(
    [true, false].flatMap((ok) =>
      [100, 200, 10_000].map((duration) => ({ ok, duration })),
    ),
  )(
    "keeps accessible status immediate and settles without a visual delay ($duration ms, success=$ok)",
    async ({ ok, duration }) => {
      vi.useFakeTimers();
      let settle!: (response: unknown) => void;
      request.mockReturnValue(
        new Promise((resolve) => {
          settle = resolve;
        }),
      );
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
      const busy = () =>
        host.querySelector('[role="status"][data-state="loading"]');
      const visual = () =>
        busy()!.querySelector<HTMLSpanElement>('span[aria-hidden="true"]')!;
      // Accessible text and the request start immediately; artwork waits 200ms.
      expect(busy()).not.toBeNull();
      expect(busy()!.textContent).toBe("Analyzing deal details");
      expect(visual().hidden).toBe(true);
      expect(request).toHaveBeenCalledTimes(1);
      await act(async () => vi.advanceTimersByTime(duration));
      expect(busy()).not.toBeNull();
      expect(visual().hidden).toBe(duration < 200);
      if (duration === 200) expect(visual().style.width).toBe("32px");
      if (duration === 10_000) expect(visual().style.width).toBe("64px");
      expect(host.querySelector('[data-state="complete"]')).toBeNull();
      await act(async () =>
        settle({
          ok,
          json: async () =>
            ok
              ? {
                  extracted: {
                    selling_price: 18000,
                    fees: [],
                    addons: [],
                    taxes: 1200,
                    total_out_the_door: 19200,
                  },
                }
              : { error: "Offer reading unavailable" },
        }),
      );
      // Completion/error removes motion in the same render, with no finish delay.
      expect(busy()).toBeNull();
      expect(
        host.querySelector(`[data-state="${ok ? "complete" : "error"}"]`),
      ).not.toBeNull();
    },
  );
  it("keeps server-rendered controls disabled until client handlers are ready", () => {
    const server = document.createElement("div");
    server.innerHTML = renderToString(React.createElement(DealCheck));
    const inputs = Array.from(
      server.querySelectorAll<HTMLInputElement>('input[type="number"]'),
    );
    expect(inputs).toHaveLength(5);
    expect(inputs.every((input) => input.disabled)).toBe(true);
    expect(
      Array.from(
        host.querySelectorAll<HTMLInputElement>('input[type="number"]'),
      ).every((input) => !input.disabled),
    ).toBe(true);
  });
  it("checks manual offer amounts without an AI key or request and exposes planning next steps", async () => {
    const values = ["18000", "300", "0", "1200", "19500"];
    for (let index = 0; index < values.length; index++)
      await fill(index, values[index]);
    await submit();
    expect(request).not.toHaveBeenCalled();
    expect(host.textContent).toContain("Quoted total matches");
    expect(host.textContent).toContain("Amounts entered by you.");
    expect(host.textContent).not.toContain("Read from your document by AI.");
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
