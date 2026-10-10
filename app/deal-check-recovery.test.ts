import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DealCheckPage from "./(dashboard)/deal-check/page";

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
async function renderDocumentMode() {
  await act(async () => root.render(React.createElement(DealCheckPage)));
  const readOffer = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent?.trim() === "Read offer",
  )!;
  await act(async () => readOffer.click());
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("retains input and offers retry after an empty response without announcing success", async () => {
  fetchMock.mockResolvedValueOnce({
    ok: false,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
  });
  await renderDocumentMode();
  const input = host.querySelector("textarea")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(
      input,
      "2020 Acura MDX, $3000 auction bid, salvage, damage unknown",
    );
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(host.textContent).toContain("Your details are still here");
  expect(host.textContent).not.toContain("Unexpected end");
  expect(host.textContent).not.toContain("Document details");
  expect(input.value).toContain("Acura MDX");
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      extracted: {
        vehicle: { year: 2020, make: "Acura", model: "MDX" },
        fees: [],
        addons: [],
        red_flags: [],
      },
      marketComparison: null,
    }),
  });
  const retry = Array.from(host.querySelectorAll("button")).find(
    (button) => button.textContent === "Try again",
  )!;
  await act(async () => retry.click());
  expect(host.textContent).toContain("Acura MDX");
  expect(host.textContent).toContain("Read from your document by AI");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("keeps upload and analyze actions outside the text input with a labeled native file control", async () => {
  await renderDocumentMode();
  const upload = Array.from(host.querySelectorAll("label")).find(
    (label) => label.textContent?.trim() === "Upload Photo",
  )!;
  const file = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  expect(upload.contains(file)).toBe(true);
  expect(file.getAttribute("aria-label")).toBe("Upload offer photo");
  expect(file.disabled).toBe(false);
  expect(upload.parentElement?.className).not.toContain("absolute");
});

it("rejects an unsupported photo without sending it for analysis", async () => {
  await renderDocumentMode();
  const file = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(file, "files", {
    value: [new File(["data"], "test.heic", { type: "image/heic" })],
  });
  await act(async () =>
    file.dispatchEvent(new Event("change", { bubbles: true })),
  );
  expect(host.textContent).toContain("PNG, JPEG or WebP");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("aborts a pending file read on unmount and ignores its stale completion", async () => {
  const readers: {
    abort: ReturnType<typeof vi.fn>;
    onload: (() => void) | null;
  }[] = [];
  vi.stubGlobal(
    "FileReader",
    class {
      abort = vi.fn();
      onload = null;
      onerror = null;
      result = "data:image/png;base64,QA";
      constructor() {
        readers.push(this);
      }
      readAsDataURL() {}
    },
  );
  await renderDocumentMode();
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", {
    value: [new File(["qa"], "qa.png", { type: "image/png" })],
  });
  await act(async () =>
    input.dispatchEvent(new Event("change", { bubbles: true })),
  );
  await act(async () => root.render(null));
  expect(readers[0].abort).toHaveBeenCalledOnce();
  await act(async () => readers[0].onload?.());
  expect(fetchMock).not.toHaveBeenCalled();
});
