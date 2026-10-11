import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { VisionDamageInspector } from "@/components/deal/VisionDamageInspector";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("does not offer dead navigation on a single captured photo", () => {
  act(() =>
    root.render(
      React.createElement(VisionDamageInspector, {
        images: ["https://img.example/1.jpg"],
      }),
    ),
  );
  expect(host.querySelector("button")).toBeNull();
  expect(host.textContent).toContain("original listing may have more");
  expect(host.textContent).toContain("has not analyzed these photos");
});
it("uses the gallery delivery policy for every photo and handles failed source images", () => {
  act(() =>
    root.render(
      React.createElement(VisionDamageInspector, {
        images: [
          "https://salvagezone.com/1.jpg",
          "https://salvagezone.com/2.jpg",
        ],
      }),
    ),
  );
  act(() =>
    host.querySelector<HTMLButtonElement>('[aria-label="Next photo"]')!.click(),
  );
  const image = host.querySelector("img")!;
  expect(image.getAttribute("src")).toBe(
    "/api/image/proxy?url=https%3A%2F%2Fsalvagezone.com%2F2.jpg",
  );
  act(() => image.dispatchEvent(new Event("error")));
  expect(host.textContent).toContain("could not load");
  expect(host.textContent).not.toContain(
    "confidence scores have been inferred",
  );
});
