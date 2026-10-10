import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { readFileSync } from "node:fs";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ item: { id: "inventory-one" } }),
  });
  vi.stubGlobal("fetch", request);
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
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.unstubAllGlobals();
});
async function open(onRecorded?: () => Promise<boolean>) {
  await act(async () =>
    root.render(
      React.createElement(AcquireToPipelineButton, {
        deal: {
          id: "deal-one",
          askPrice: 10000,
          make: "Honda",
          model: "Civic",
        },
        onRecorded,
      }),
    ),
  );
  const button = host.querySelector<HTMLButtonElement>("button")!;
  button.focus();
  await act(async () => button.click());
  return button;
}
async function fill(value: string) {
  const input = host.querySelector<HTMLInputElement>('input[type="number"]')!;
  await act(async () => {
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
describe("purchase recording confirmation", () => {
  it("does not move a Saved card between groups before its status write is confirmed", () => {
    const source = readFileSync("app/(dashboard)/saved/page.tsx", "utf8");
    const handler = source.slice(
      source.indexOf("const handleUpdateStatus"),
      source.indexOf("const handleSaveNewUrl"),
    );
    expect(handler).not.toContain("saves?.map");
    expect(handler).toContain("return false");
    expect(handler).toContain("Saved status was not confirmed changed");
  });
  it("opens without a write or bid/asking-price default, and cancellation restores focus", async () => {
    const button = await open();
    expect(request).not.toHaveBeenCalled();
    expect(host.querySelector("dialog")?.open).toBe(true);
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("");
    await act(async () =>
      host
        .querySelector("dialog")!
        .dispatchEvent(new Event("cancel", { cancelable: true })),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it("rejects missing/negative amounts, preserves unknown facts, and posts the amount actually entered", async () => {
    await open();
    await submit();
    expect(request).not.toHaveBeenCalled();
    await fill("-1");
    await submit();
    expect(request).not.toHaveBeenCalled();
    await fill("8750");
    await submit();
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body).toMatchObject({
      purchasePrice: 8750,
      vin: "",
      year: 0,
      condition: "unknown",
      dealId: "deal-one",
    });
    expect(body).not.toHaveProperty("marketValue");
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.textContent).toContain("Purchase recorded");
    expect(document.activeElement).toBe(host.querySelector('a[href="/fleet"]'));
  });
  it.each(["HTTP failure", "missing confirmation"])(
    "does not claim success after %s",
    async (failure) => {
      request.mockResolvedValue({
        ok: failure !== "HTTP failure",
        json: async () => ({}),
      });
      await open();
      await fill("8750");
      await submit();
      expect(host.querySelector("dialog")?.open).toBe(true);
      expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("8750");
      expect(host.textContent).toContain("Check Pipeline before retrying");
      expect(host.textContent).not.toContain("Purchase recorded");
    },
  );
  it("does not repeat acquisition when the follow-up saved status update fails", async () => {
    await open(async () => false);
    await fill("0");
    await submit();
    expect(request).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain(
      "Purchase recorded. Saved-list status did not update",
    );
    expect(host.querySelector("button")).toBeNull();
  });
});
