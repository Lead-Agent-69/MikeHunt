import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { AcquireToPipelineButton } from "@/components/deal/AcquireToPipelineButton";
import { readFileSync } from "node:fs";
import { SWRConfig } from "swr";
const account = vi.hoisted(() => ({
  owner: "owner" as string | null,
  loading: false,
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: account.owner, loading: account.loading }),
}));
let host: HTMLDivElement;
let root: Root;
let request: ReturnType<typeof vi.fn>;
it("reopens a purchased listing as a pipeline link without offering another purchase", async () => {
  const dealId = "a0000000-0000-4000-8000-000000000001";
  request.mockResolvedValue({
    ok: true,
    json: async () => ({
      ownerId: "owner",
      items: [{ id: "unit", dealerId: "owner", vehicleId: dealId }],
      total: 1,
      hasMore: false,
    }),
  });
  await act(async () => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map() } },
        React.createElement(AcquireToPipelineButton, { deal: { id: dealId } }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.textContent).toContain("Purchase recorded");
  expect(host.querySelector('a[href="/fleet"]')).not.toBeNull();
  expect(host.querySelector("button")).toBeNull();
  expect(request).toHaveBeenCalledWith(
    `/api/inventory?dealId=${dealId}&limit=1`,
    expect.objectContaining({ headers: { "x-inventory-owner": "owner" } }),
  );
});
it("does not offer a writable purchase when existing-record verification fails", async () => {
  request.mockRejectedValue(new Error("Network unavailable"));
  await act(async () => {
    root.render(
      React.createElement(
        SWRConfig,
        { value: { provider: () => new Map() } },
        React.createElement(AcquireToPipelineButton, {
          deal: { id: "a0000000-0000-4000-8000-000000000002" },
        }),
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "Existing purchase status could not be checked",
  );
  expect(host.querySelector<HTMLButtonElement>("button")?.disabled).toBe(true);
  expect(host.textContent).toContain("Retry purchase check");
  expect(host.querySelector("dialog")).toBeNull();
});
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  account.owner = "owner";
  account.loading = false;
  sessionStorage.clear();
  request = vi.fn().mockImplementation(async (_url, options) => ({
    ok: true,
    json: async () => ({
      ownerId: "owner",
      item: {
        id: JSON.parse(options.body).id,
        dealerId: "owner",
        stage: "acquired",
        purchasePrice: JSON.parse(options.body).purchasePrice,
        floorDate: JSON.parse(options.body).purchaseDate,
      },
    }),
  }));
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
      expect(host.textContent).toMatch(
        /Reload your vehicles|Reload your vehicles before continuing/,
      );
      expect(host.textContent).not.toContain("Purchase recorded");
    },
  );
  it("reuses the purchase id after a lost response, cancellation and remount", async () => {
    request.mockRejectedValueOnce(new Error("Connection lost"));
    await open();
    await fill("8750");
    await submit();
    const original = JSON.parse(request.mock.calls[0][1].body).id;
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Close purchase form"]',
        )!
        .click(),
    );
    await act(async () => root.render(null));
    await open();
    await fill("8750");
    await submit();
    expect(JSON.parse(request.mock.calls[1][1].body).id).toBe(original);
    expect(host.textContent).toContain("Purchase recorded");
  });
  it("shows confirmed purchase success with a separate outcome-tracking warning", async () => {
    request.mockImplementation(async (_url, options) => ({
      ok: true,
      json: async () => ({
        ownerId: "owner",
        item: {
          id: JSON.parse(options.body).id,
          dealerId: "owner",
          stage: "acquired",
          purchasePrice: 8750,
          floorDate: JSON.parse(options.body).purchaseDate,
        },
        outcomeReview: {
          synced: false,
          message:
            "Purchase recorded. Outcome tracking needs review in Pipeline. Do not record the purchase again.",
        },
      }),
    }));
    await open();
    await fill("8750");
    await submit();
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.textContent).toContain(
      "Outcome tracking needs review in Pipeline",
    );
    expect(host.querySelector('a[href="/fleet"]')).not.toBeNull();
  });
  it.each(["1.234", "100000001"])(
    "rejects unsupported actual amounts %s",
    async (amount) => {
      await open();
      await fill(amount);
      await submit();
      expect(request).not.toHaveBeenCalled();
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
  it("resets a purchase draft and ignores its late callback after an account switch", async () => {
    const recorded = vi.fn(async () => true);
    let confirm!: (value: unknown) => void;
    request.mockImplementation(
      () =>
        new Promise((resolve) => {
          confirm = resolve;
        }),
    );
    await open(recorded);
    await fill("1000");
    await submit();
    expect(request.mock.calls[0][1].headers["x-inventory-owner"]).toBe("owner");
    account.owner = "new-owner";
    await open(recorded);
    expect(host.querySelector<HTMLInputElement>("input")?.value).toBe("");
    await act(async () =>
      confirm({
        ok: true,
        json: async () => ({
          ownerId: "owner",
          item: { id: "unit", dealerId: "owner", stage: "acquired" },
        }),
      }),
    );
    expect(recorded).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Purchase recorded");
  });
  it("offers sign-in instead of a writable purchase form after sign-out", async () => {
    await open();
    await fill("1000");
    account.owner = null;
    await act(async () =>
      root.render(
        React.createElement(AcquireToPipelineButton, {
          deal: { id: "deal-one" },
        }),
      ),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(host.querySelector('a[href="/login"]')?.textContent).toContain(
      "Sign in",
    );
    expect(request).not.toHaveBeenCalled();
  });
});
