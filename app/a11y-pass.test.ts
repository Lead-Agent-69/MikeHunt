import { readFileSync } from "node:fs";
import { createElement, useRef, useState, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDialogA11y } from "@/hooks/useDialogA11y";

const read = (p: string) => readFileSync(p, "utf8");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function Harness() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  useDialogA11y(open, () => setOpen(false), panelRef);
  return createElement(
    "div",
    null,
    createElement(
      "button",
      { id: "opener", onClick: () => setOpen(true) },
      "Open",
    ),
    open &&
      createElement(
        "div",
        { ref: panelRef, role: "dialog", "aria-modal": "true" },
        createElement("button", { id: "first" }, "First"),
        createElement("button", { id: "last" }, "Last"),
      ),
  );
}

describe("useDialogA11y", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    // jsdom has no layout; treat every element as rendered.
    vi.spyOn(Element.prototype, "getClientRects").mockReturnValue([
      {},
    ] as unknown as DOMRectList);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((cb) => {
      cb(0);
      return 0;
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  const key = (k: string, shiftKey = false) =>
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true }),
      );
    });

  it("moves focus in, traps Tab, closes on Escape and restores focus", () => {
    act(() => root.render(createElement(Harness)));
    const opener = document.getElementById("opener") as HTMLButtonElement;
    opener.focus();
    act(() => opener.click());

    expect(document.activeElement?.id).toBe("first");
    expect(document.body.style.overflow).toBe("hidden");

    (document.getElementById("last") as HTMLButtonElement).focus();
    key("Tab");
    expect(document.activeElement?.id).toBe("first");
    key("Tab", true);
    expect(document.activeElement?.id).toBe("last");

    key("Escape");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement).toBe(opener);
    expect(document.body.style.overflow).toBe("");
  });
});

describe("a11y pass wiring", () => {
  it("names and wires every modal that uses the shared dialog hook", () => {
    for (const file of [
      "components/deal/CashOfferLetterModal.tsx",
      "components/scan/LaneModeHUD.tsx",
      "components/ui/next-level-features.tsx",
      "app/(dashboard)/lane/page.tsx",
    ]) {
      const src = read(file);
      expect(src, file).toContain("useDialogA11y(");
      expect(src, file).toContain('role="dialog"');
      expect(src, file).toContain('aria-modal="true"');
    }
  });

  it("leaves native <dialog> modals (focus trap + Escape built in) on the platform element", () => {
    for (const file of [
      "components/shared/CommandPalette.tsx",
      "components/shared/ImageGallery.tsx",
      "app/(dashboard)/fleet/page.tsx",
    ]) {
      expect(read(file), file).toMatch(/<(motion\.)?dialog\b/);
    }
  });

  it("keeps decorative icons and skeletons out of the accessibility tree", () => {
    expect(read("components/shared/Ico.tsx")).toContain('"aria-hidden": true');
    const skeleton = read("components/shared/Skeleton.tsx");
    expect(skeleton).toContain('aria-hidden="true"');
    expect(skeleton).not.toContain('aria-live="polite"');
    expect(read("components/shared/ErrorState.tsx")).toContain(
      'aria-label="Dismiss message"',
    );
  });

  it("offers a skip link to the dashboard main region", () => {
    const layout = read("app/(dashboard)/layout.tsx");
    expect(layout).toContain('href="#main-content"');
    expect(layout).toContain('id="main-content"');
  });

  it("keeps light-theme muted text and focus rings at WCAG AA", () => {
    const css = read("app/globals.css");
    const light = css.slice(css.indexOf('[data-theme="light"]'));
    expect(light).toContain("--t4: #535e72;");
    expect(light).toContain("--t5: #5f6b7f;");
    expect(css).not.toContain("outline: 2px solid rgba(7, 91, 232, 0.58)");
    expect(css).toContain("--on-accent: #ffffff;");
    expect(css).toContain("--on-accent: #0b1220;");
  });

  it("does not use background-color utilities for the brand gradient", () => {
    for (const file of [
      "app/(dashboard)/sources/page.tsx",
      "app/(marketing)/showcase/page.tsx",
      "components/ui/premium-carousel.tsx",
      "components/ui/ui-drawer-card.tsx",
    ]) {
      expect(read(file), file).not.toContain("bg-[var(--grad)]");
    }
  });
});
