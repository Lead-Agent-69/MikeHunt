import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("swr", () => ({ default: () => ({ data: [], mutate: vi.fn() }) }));
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "parts" } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
import Page from "./(dashboard)/parts/page";
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  request = vi.fn();
  vi.stubGlobal("fetch", request);
  host = document.createElement("div");
  root = createRoot(host);
  await act(async () => root.render(React.createElement(Page)));
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("starts with unknown costs and calculates entered amounts without a service", async () => {
  expect(host.textContent).toContain("Not calculated");
  const inputs = host.querySelectorAll<HTMLInputElement>("input[type=number]");
  const values = ["100", "200", "50", "0", "30"];
  for (let index = 0; index < inputs.length; index++)
    await fill(inputs[index], values[index]);
  expect(host.textContent).toContain("$380.00");
  expect(request).not.toHaveBeenCalled();
});
it("retains amounts and does not celebrate an unconfirmed budget write", async () => {
  await fill(host.querySelector("input:not([type=number])")!, "TEST Civic");
  for (const input of Array.from(
    host.querySelectorAll<HTMLInputElement>("input[type=number]"),
  ))
    await fill(input, "0");
  request.mockResolvedValue({
    ok: true,
    json: async () => ({
      id: "bad",
      vehicle_name: "other",
      total_estimate: 0,
      parts_list: [],
    }),
  });
  const button = Array.from(host.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("Save budget"),
  )!;
  await act(async () => button.click());
  expect(host.querySelector("[role=alert]")?.textContent).toContain(
    "not confirmed",
  );
  expect(host.textContent).not.toContain("Budget saved to your account");
  expect(
    host.querySelector<HTMLInputElement>("input[type=number]")?.value,
  ).toBe("0");
});
