import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  key: "",
  mutate: vi.fn(),
  save: vi.fn(),
  error: null as Error | null,
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner", loading: false }),
}));
vi.mock("@/lib/inventory/update-listings", () => ({
  markInventoryListed: mocks.save,
}));
vi.mock("swr", () => ({
  default: (key: string) => {
    mocks.key = key;
    return {
      data: {
        items: [
          {
            id: "unit",
            year: 2020,
            make: "Honda",
            model: "Civic",
            stage: "recon",
            listPrice: null,
            totalCost: 9000,
            listedPlatforms: ["craigslist"],
          },
        ],
        total: 30,
        hasMore: !key.includes("offset=25"),
      },
      error: mocks.error,
      isLoading: false,
      mutate: mocks.mutate,
    };
  },
}));
import ListPage from "./(dashboard)/list/page";
let host: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.error = null;
  mocks.save.mockReset();
  mocks.mutate.mockClear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(React.createElement(ListPage)));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function select(index: number) {
  await act(async () =>
    host
      .querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
      [index].click(),
  );
}
function submit() {
  return Array.from(host.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("Record posted listings"),
  )!;
}
describe("Listing Manager handoff", () => {
  it("loads preparation stock and labels absent listing prices without using cost as price", () => {
    expect(mocks.key).toContain("stage=recon,listed");
    expect(host.textContent).toContain("Listing price not recorded");
    expect(host.textContent).not.toContain("$9,000");
    expect(host.textContent).toContain("No marketplace listing is published");
    expect(host.querySelectorAll("input:checked")).toHaveLength(0);
  });
  it("requires vehicle, marketplace and explicit posted confirmation, then preserves existing posts", async () => {
    await select(0);
    await select(1);
    expect(submit().disabled).toBe(true);
    await select(6);
    expect(submit().disabled).toBe(false);
    mocks.save.mockResolvedValue({ updatedIds: ["unit"], failedIds: [] });
    await act(async () => submit().click());
    expect(mocks.save).toHaveBeenCalledWith(
      ["unit"],
      ["facebook"],
      expect.any(Function),
      { unit: ["craigslist"] },
    );
    expect(host.textContent).toContain("1 vehicle record confirmed updated");
    expect(host.querySelectorAll("section input:checked")).toHaveLength(0);
  });
  it("retains failed vehicles, offers reload and clears confirmation before retry", async () => {
    await select(0);
    await select(1);
    await select(6);
    mocks.save.mockResolvedValue({ updatedIds: [], failedIds: ["unit"] });
    await act(async () => submit().click());
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "1 not confirmed",
    );
    expect(host.querySelectorAll("section input:checked")).toHaveLength(1);
    expect(submit().disabled).toBe(true);
    expect(host.textContent).toContain("Reload inventory");
  });
  it("pages beyond the first pool without carrying selection into another page", async () => {
    await select(0);
    await act(async () =>
      host
        .querySelector<HTMLButtonElement>('[aria-label="Next inventory page"]')!
        .click(),
    );
    expect(mocks.key).toContain("offset=25");
    expect(host.querySelectorAll("section input:checked")).toHaveLength(0);
  });
  it("blocks mutation during a failed inventory read without a false empty state", async () => {
    mocks.error = new Error("offline");
    await act(async () => root.render(React.createElement(ListPage)));
    expect(host.textContent).toContain("Couldn't load inventory");
    expect(host.textContent).not.toContain("No vehicles in this stage");
    expect(submit().disabled).toBe(true);
  });
});
