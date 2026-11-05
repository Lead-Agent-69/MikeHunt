import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { MarketListing } from "@/lib/market/explorer";

vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/link", () => ({
  default: ({ children, ...props }: any) => <a {...props}>{children}</a>,
}));
vi.mock("@/hooks/useListingPhotos", () => ({
  useListingPhotos: (images: string[]) => ({ image: images?.[0] }),
}));
import { MarketResultsMap } from "@/components/market/MarketResultsMap";

const rows = [
  {
    id: "one",
    title: "2020 Ford Mustang EcoBoost Premium Convertible",
    locationCity: "Saint Louis",
    locationState: "MO",
    mileage: 18282,
    mapLat: 38,
    mapLng: -90,
    images: ["https://photos.example.test/one.jpg"],
    price: { amount: 17995, label: "Asking price" },
  },
  {
    id: "two",
    title: "2021 Honda Civic",
    mapLat: 39,
    mapLng: -91,
    images: [],
  },
] as unknown as MarketListing[];

let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  sessionStorage.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

it("keeps the selected vehicle's full title and location together beside its photo", async () => {
  await act(async () => root.render(<MarketResultsMap rows={rows} flipDesk />));
  const preview = host.querySelector(
    '[role="group"][aria-label="Selected mapped listing"]',
  )!;
  const photo = preview.querySelector("img")!;
  const text = photo.nextElementSibling!;
  expect(photo.alt).toBe(rows[0].title);
  expect(text.textContent).toContain(rows[0].title);
  expect(text.textContent).toContain("Saint Louis, MO · 18,282 mi");
  expect(preview.querySelector("a")).toBeNull();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/deal/one");
});

it("keeps accessible selection, review destination and missing-data text in sync", async () => {
  await act(async () =>
    root.render(<MarketResultsMap rows={rows} flipDesk={false} />),
  );
  const picker = host.querySelector(
    'select[aria-label="Inspect mapped listing"]',
  ) as HTMLSelectElement;
  await act(async () => {
    picker.value = "two";
    picker.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const preview = host.querySelector(
    '[role="group"][aria-label="Selected mapped listing"]',
  )!;
  expect(preview.textContent).toContain(rows[1].title);
  expect(preview.textContent).toContain(
    "Location not reported · mileage not reported",
  );
  expect(preview.querySelector("img")).toBeNull();
  expect(host.querySelector("a")?.getAttribute("href")).toBe("/deal/two");
  expect(host.textContent).toContain("Price not reported");
});
