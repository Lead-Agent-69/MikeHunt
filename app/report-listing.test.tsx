import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authed: true, isLoading: false }));
vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => state }));
import { ReportListing } from "@/components/deal/ReportListing";
let root: Root;
let host: HTMLDivElement;
const fetcher = vi.fn();
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", fetcher);
  fetcher.mockReset();
  state.authed = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <ReportListing listingId="22222222-2222-4222-8222-222222222222" />,
    ),
  );
  act(() => host.querySelector("button")!.click());
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
const write = () =>
  act(() => {
    const area = host.querySelector("textarea")!;
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(area, "The seller price is different.");
    area.dispatchEvent(new Event("input", { bubbles: true }));
  });
const submit = () =>
  act(async () => {
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
describe("listing report form", () => {
  it("retains failed reports and retries with the same ID, then confirms the actual stored receipt", async () => {
    write();
    fetcher.mockRejectedValueOnce(new Error("timeout"));
    await submit();
    expect(host.querySelector("textarea")!.value).toBe(
      "The seller price is different.",
    );
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
    const first = JSON.parse(fetcher.mock.calls[0][1].body);
    fetcher.mockImplementationOnce(async (_url, options) =>
      Response.json({ saved: true, id: JSON.parse(options.body).id }),
    );
    await submit();
    expect(JSON.parse(fetcher.mock.calls[1][1].body).id).toBe(first.id);
    expect(host.querySelector('[role="status"]')!.textContent).toContain(
      first.id,
    );
  });
  it("does not accept an unconfirmed success response", async () => {
    write();
    fetcher.mockResolvedValueOnce(Response.json({ saved: true, id: "other" }));
    await submit();
    expect(host.querySelector('[role="status"]')).toBeNull();
    expect(host.querySelector("textarea")!.value).not.toBe("");
  });
  it("offers sign-in instead of submitting anonymously", async () => {
    state.authed = false;
    await act(async () =>
      root.render(
        <ReportListing listingId="22222222-2222-4222-8222-222222222222" />,
      ),
    );
    expect(host.querySelector("a")!.getAttribute("href")).toContain(
      "/login?next=",
    );
    expect(host.querySelector("form")).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
