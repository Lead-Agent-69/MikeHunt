import React, { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoPreview } from "@/components/shared/PhotoPreview";

describe("global photo previews", () => {
  let host: HTMLDivElement;
  let root: Root;
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
  it("shares the viewport-safe preview across all alternative galleries", () => {
    for (const file of [
      "carousel-showcase",
      "production-ready",
      "live-data-carousel",
    ]) {
      const source = readFileSync(`components/ui/${file}.tsx`, "utf8");
      expect(source).toMatch(/<PhotoPreview\s+images=\{images\}/);
      expect(source).not.toContain("images[selectedIndex].src");
    }
  });
  it("portals outside the gallery and supports mobile-safe sizing and keyboard navigation", () => {
    function Gallery() {
      const [selectedIndex, onSelect] = useState<number | null>(null);
      return React.createElement(
        React.Fragment,
        null,
        React.createElement("button", { onClick: () => onSelect(0) }, "Open"),
        React.createElement(PhotoPreview, {
          images: [
            { src: "/one.jpg", alt: "Front" },
            { src: "/two.jpg", alt: "Rear" },
          ],
          selectedIndex,
          onSelect,
        }),
      );
    }
    act(() => root.render(React.createElement(Gallery)));
    const trigger = host.querySelector("button")!;
    trigger.focus();
    act(() => trigger.click());
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.className).toContain("h-[100dvh]");
    expect(dialog.className).toContain("safe-area-inset-bottom");
    expect(dialog.querySelector("img")!.className).toContain("object-contain");
    act(() =>
      dialog.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      ),
    );
    expect(dialog.querySelector("img")!.alt).toBe("Rear");
    act(() =>
      dialog
        .querySelector<HTMLButtonElement>('[aria-label="Close photo preview"]')!
        .click(),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
