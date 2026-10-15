import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useListingPhotos } from "@/hooks/useListingPhotos";
let root: Root, host: HTMLDivElement;
function Harness({ urls }: { urls: unknown }) {
  const gallery = useListingPhotos(urls);
  return gallery.exhausted ? (
    <span>No usable photos</span>
  ) : (
    <img src={gallery.image} onError={gallery.reject} alt="Vehicle" />
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
