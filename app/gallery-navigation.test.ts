import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { ImageGallery } from "@/components/shared/ImageGallery";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
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
describe("listing photo navigation", () => {
  it("opens a named native modal, navigates by keyboard and restores focus on Escape", async () => {
    await act(async () =>
      root.render(
        React.createElement(ImageGallery, {
          title: "Honda Civic",
          images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
        }),
      ),
    );
    const opener = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Open photo 1 of 2: Honda Civic"]',
    )!;
    expect(opener).not.toBeNull();
    opener.focus();
    await act(async () => opener.click());
    expect(document.querySelector("dialog")?.open).toBe(true);
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.querySelector("dialog")?.getAttribute("aria-label")).toBe(
      "Honda Civic listing photos",
    );
    await act(async () =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight" }),
      ),
    );
    expect(document.querySelector("dialog")?.textContent).toContain("2 / 2");
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(document.querySelector("dialog")?.open ?? false).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});
