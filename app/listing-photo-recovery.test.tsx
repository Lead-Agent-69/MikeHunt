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
function Harness({ urls, id }: { urls: unknown; id?: string }) {
  const gallery = useListingPhotos(urls, id);
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
  sessionStorage.clear();
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
it("does not carry a failed shared URL into a different listing", async () => {
  const urls = ["https://dealer.test/shared.jpg"];
  await act(async () => root.render(<Harness urls={urls} id="first" />));
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  expect(host.querySelector("img")).toBeNull();
  await act(async () => root.render(<Harness urls={urls} id="second" />));
  expect(host.querySelector("img")?.src).toBe(urls[0]);
});
it("a changed source gallery retries its previously failed cover", async () => {
  const first = "https://dealer.test/front.jpg";
  await act(async () => root.render(<Harness urls={[first]} id="same" />));
  await act(async () =>
    host.querySelector("img")!.dispatchEvent(new Event("error")),
  );
  await act(async () =>
    root.render(
      <Harness urls={[first, "https://dealer.test/new.jpg"]} id="same" />,
    ),
  );
  expect(host.querySelector("img")?.src).toBe(first);
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
it("tries another captured Discovery photo and keeps retry access after all covers fail", async () => {
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
  ).not.toBeNull();
});
