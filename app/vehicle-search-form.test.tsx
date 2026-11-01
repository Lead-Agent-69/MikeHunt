import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { VehicleSearchForm } from "@/components/search/VehicleSearchForm";
import { inventorySearchHref } from "@/lib/search/browse-search";

let host: HTMLDivElement, root: Root;
const submit = vi.fn();
function Fixture({ disabled = false, compact = false }) {
  const [value, setValue] = useState("");
  return (
    <VehicleSearchForm
      value={value}
      onChange={setValue}
      onSubmit={() => submit(value)}
      disabled={disabled}
      showSubmit={!compact}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  submit.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("uses a labelled controlled field and submits the current draft once", () => {
  act(() => root.render(<Fixture />));
  const input = host.querySelector("input")!;
  act(() => {
    input.value = "Ford wagon";
    Simulate.change(input);
  });
  expect(input.getAttribute("aria-label")).toBe("Search all vehicle inventory");
  act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(submit).toHaveBeenCalledExactlyOnceWith("Ford wagon");
});
it("guards submission while the account scope is unavailable", () => {
  act(() => root.render(<Fixture disabled />));
  expect(host.querySelector("input")!.disabled).toBe(true);
  expect(host.querySelector("button")!.disabled).toBe(true);
  act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(submit).not.toHaveBeenCalled();
});
it("retains keyboard submission without adding a second button in the scroll bar", () => {
  act(() => root.render(<Fixture compact />));
  expect(host.querySelectorAll("button")).toHaveLength(0);
  act(() =>
    host
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
  expect(submit).toHaveBeenCalledExactlyOnceWith("");
});
it("preserves radius, source and evidence scope while starting a new query at the first batch", () => {
  const href = inventorySearchHref(
    "?states=MO%2CIL&near=63101&radius=150&sources=craigslist&includeRepairable=0&hasPhotos=yes&priceBasis=cash&page=3&q=old",
    "  Ford & Lincoln  ",
  );
  const params = new URL(href, "https://dealerhunt.vercel.app").searchParams;
  expect(params.get("q")).toBe("Ford & Lincoln");
  expect(params.has("page")).toBe(false);
  for (const [key, value] of Object.entries({
    states: "MO,IL",
    near: "63101",
    radius: "150",
    sources: "craigslist",
    includeRepairable: "0",
    hasPhotos: "yes",
    priceBasis: "cash",
  }))
    expect(params.get(key)).toBe(value);
});
it("clears a previous text query without clearing the location", () => {
  expect(inventorySearchHref("?states=MO&q=old&page=2", "   ")).toBe(
    "/market?states=MO",
  );
});
it("opens the existing full-filter panel only for a filter action", () => {
  const target = inventorySearchHref(
    "?states=MO&near=63101&radius=150&page=4",
    "Ford",
    { openFilters: true },
  );
  const params = new URL(target, "https://dealerhunt.vercel.app").searchParams;
  expect(params.get("filters")).toBe("open");
  expect(params.get("near")).toBe("63101");
  expect(params.get("q")).toBe("Ford");
  expect(params.has("page")).toBe(false);
  expect(inventorySearchHref("?states=MO&filters=open", "Ford")).not.toContain(
    "filters=",
  );
});
it("carries an explicit nearby search without inheriting home states or forwarding unrelated URL data", () => {
  const href = inventorySearchHref("?states=MO%2CFL&mode=reseller", "Ford", {
    currentQuery:
      "near=63101&radius=150&sources=craigslist&priceBasis=cash&hasPhotos=yes&token=private&code=private",
  });
  const p = new URL(href, "https://dealerhunt.vercel.app").searchParams;
  expect(p.get("near")).toBe("63101");
  expect(p.get("radius")).toBe("150");
  expect(p.get("sources")).toBe("craigslist");
  expect(p.get("priceBasis")).toBe("cash");
  expect(p.get("hasPhotos")).toBe("yes");
  expect(p.has("states")).toBe(false);
  expect(p.has("state")).toBe(false);
  expect(p.has("token")).toBe(false);
  expect(p.has("code")).toBe(false);
});
it("lets an explicit state replace the saved multi-state default", () => {
  const p = new URL(
    inventorySearchHref("?states=MO%2CFL", "Ford", {
      currentQuery: "state=IL",
    }),
    "https://dealerhunt.vercel.app",
  ).searchParams;
  expect(p.get("state")).toBe("IL");
  expect(p.has("states")).toBe(false);
});
