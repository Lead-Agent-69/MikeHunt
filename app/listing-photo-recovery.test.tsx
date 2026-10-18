import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useListingPhotos } from "@/hooks/useListingPhotos";
import { DiscoveryCard } from "@/components/discovery/DiscoveryCard";
import type { DiscoveryDeal } from "@/components/discovery/types";
vi.mock("@/components/discovery/DiscoverySaveProvider", () => ({
  useDiscoverySave: () => ({
    saved: false,
    busy: false,
    label: "Save vehicle",
    toggle: vi.fn(),
  }),
}));
let root: Root, host: HTMLDivElement;
function Harness({ urls }: { urls: unknown }) {
  const gallery = useListingPhotos(urls);
  return gallery.exhausted ? (
    <span>No usable photos</span>
  ) : (
    <>
      <img src={gallery.image} onError={gallery.reject} alt="Vehicle" />
      <button onClick={() => gallery.select(gallery.images.length - 1)}>
        Last photo
      </button>
    </>
  );
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});
it("tries real alternatives, then hides an exhausted gallery instead of using a stock car", async () => {
  await act(async () =>
    root.render(
      <Harness
        urls={["https://dealer.test/1.jpg", "https://dealer.test/2.jpg"]}
      />,
    ),
  );
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")?.src).toBe("https://dealer.test/2.jpg");
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")).toBeNull();
  expect(host.textContent).toBe("No usable photos");
});
it("accepts new gallery URLs without reusing a failed URL after a refresh", async () => {
  await act(async () =>
    root.render(<Harness urls={["https://dealer.test/old.jpg"]} />),
  );
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  await act(async () =>
    root.render(<Harness urls={["https://dealer.test/new.jpg"]} />),
  );
  expect(host.querySelector("img")?.src).toBe("https://dealer.test/new.jpg");
});
it("keeps the full supplied gallery available beyond 20 captured photos", async () => {
  const urls = Array.from(
    { length: 25 },
    (_, index) => `https://dealer.test/${index}.jpg`,
  );
  await act(async () => root.render(<Harness urls={urls} />));
  await act(async () =>
    host.querySelector<HTMLButtonElement>("button")!.click(),
  );
  expect(host.querySelector("img")?.src).toBe(urls[24]);
});
it("tries another captured Discovery photo before replacing the card photo with a placeholder", async () => {
  const deal = {
    id: "photo-recovery",
    title: "Gallery vehicle",
    source: "independent_dealer",
    askPrice: 10000,
    images: [
      "https://dealer.test/front.jpg",
      "https://dealer.test/interior.jpg",
    ],
    alsoOn: [],
    listingCount: 1,
    grade: "unknown",
    gradeLabel: "Unverified",
    discountPct: 0,
  } satisfies DiscoveryDeal;
  await act(async () => root.render(<DiscoveryCard deal={deal} />));
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")?.src).toBe(
    "https://dealer.test/interior.jpg",
  );
  expect(
    host.querySelector(
      'button[aria-label="Enlarge photos of Gallery vehicle"]',
    ),
  ).not.toBeNull();
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")).toBeNull();
  expect(
    host.querySelector(
      'button[aria-label="Enlarge photos of Gallery vehicle"]',
    ),
  ).toBeNull();
});
