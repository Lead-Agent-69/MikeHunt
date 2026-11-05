// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarketListing } from "@/lib/market/explorer";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/hooks/useListingPhotos", () => ({
  useListingPhotos: () => ({ image: null }),
}));
import { MarketResultsMap } from "@/components/market/MarketResultsMap";

const rows = ["one", "two"].map((id) => ({
  id,
  title: `Vehicle ${id}`,
  mapLat: 38,
  mapLng: -90,
  images: [],
})) as unknown as MarketListing[];
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/market?states=MO");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("restores the selected mapped vehicle after detail without crossing search scopes", async () => {
  await act(async () =>
    root.render(<MarketResultsMap rows={rows} flipDesk={false} />),
  );
  const select = host.querySelector("select")!;
  await act(async () => {
    select.value = "two";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () =>
    root.render(<MarketResultsMap rows={rows} flipDesk={false} />),
  );
  expect(host.querySelector("select")!.value).toBe("two");
  await act(async () => root.unmount());
  window.history.replaceState(null, "", "/market?states=FL");
  root = createRoot(host);
  await act(async () =>
    root.render(<MarketResultsMap rows={rows} flipDesk={false} />),
  );
  expect(host.querySelector("select")!.value).toBe("one");
});
it("ignores expired selection and removed vehicles", async () => {
  sessionStorage.setItem(
    "dh-market-map-selection-v1",
    JSON.stringify({
      scope: "/market?states=MO",
      id: "two",
      at: Date.now() - 31 * 60_000,
    }),
  );
  await act(async () =>
    root.render(<MarketResultsMap rows={rows} flipDesk={false} />),
  );
  expect(host.querySelector("select")!.value).toBe("one");
  await act(async () =>
    root.render(<MarketResultsMap rows={[rows[1]]} flipDesk={false} />),
  );
  expect(host.querySelector("select")!.value).toBe("two");
});
