import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ImageGallery } from "@/components/shared/ImageGallery";

vi.mock("framer-motion", () => ({
  motion: {
    dialog: React.forwardRef<HTMLDialogElement, Record<string, unknown>>(
      function MotionDialog(
        {
          initial: _initial,
          animate: _animate,
          exit: _exit,
          transition: _transition,
          ...props
        },
        ref,
      ) {
        return React.createElement("dialog", { ...props, ref });
      },
    ),
    div: React.forwardRef<HTMLDivElement, Record<string, unknown>>(
      function MotionDiv(props, ref) {
        const motionProps = new Set([
          "initial",
          "animate",
          "exit",
          "transition",
          "variants",
          "custom",
          "drag",
          "dragConstraints",
          "dragElastic",
          "onDragEnd",
        ]);
        const rest = Object.fromEntries(
          Object.entries(props).filter(([key]) => !motionProps.has(key)),
        );
        return React.createElement("div", { ...rest, style: undefined, ref });
      },
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  useMotionValue: () => ({ set: vi.fn() }),
  useTransform: () => 1,
  animate: vi.fn(),
}));

describe("listing photo preview", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
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
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    host = document.createElement("div");
    host.style.transform = "translateY(20px)";
    host.style.overflow = "hidden";
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root.render(
        React.createElement(ImageGallery, {
          images: ["/car-one.jpg", "/car-two.jpg"],
          title: "GMC Sierra",
        }),
      ),
    );
  });
  afterEach(() => {
    act(() => root.unmount());
    Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
    host.remove();
    document.body.style.overflow = "";
    vi.unstubAllGlobals();
  });
  function open() {
    act(() => host.querySelector("img")!.click());
    return document.querySelector<HTMLElement>('[role="dialog"]')!;
  }
  it("escapes clipped parents and bounds the entire photo inside a viewport overlay", () => {
    const dialog = open();
    expect(dialog.parentElement).toBe(document.body);
    expect(host.contains(dialog)).toBe(false);
    expect(dialog.className).toContain("fixed inset-0");
    expect(dialog.className).toContain("overflow-hidden");
    expect(dialog.querySelector("img")!.className).toContain("h-full");
    expect(dialog.querySelector("img")!.className).toContain("object-contain");
    expect(document.body.style.overflow).toBe("hidden");
  });
  it("supports next photo, focus containment, Escape and scroll restoration", () => {
    document.body.style.overflow = "auto";
    const dialog = open();
    const close = dialog.querySelector<HTMLButtonElement>(
      '[aria-label="Close lightbox"]',
    )!;
    const next = dialog.querySelector<HTMLButtonElement>(
      '[aria-label="Next image"]',
    )!;
    expect(document.activeElement).toBe(close);
    act(() => next.click());
    expect(dialog.querySelector("img")!.alt).toBe("GMC Sierra - View 2");
    next.focus();
    act(() =>
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", cancelable: true }),
      ),
    );
    expect(document.activeElement).toBe(close);
    act(() =>
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })),
    );
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.body.style.overflow).toBe("auto");
  });
});
