import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DealCheckPage from "./(dashboard)/deal-check/page";

let root: Root;
let host: HTMLDivElement;
let fetchMock: ReturnType<typeof vi.fn>;
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
  await act(async () => root.render(React.createElement(DealCheckPage)));
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
  expect(host.textContent).not.toContain("Analysis ready");
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
  expect(host.textContent).toContain("Analysis ready");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
