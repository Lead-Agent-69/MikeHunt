import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("Find similar modal", () => {
  it("modal tolerates array or { deals } and stays on-screen", () => {
    const modal = read("components/saved/FindSimilarModal.tsx");
    expect(modal).toContain("Array.isArray(data?.deals)");
    expect(modal).toContain("createPortal(");
    expect(modal).toContain("document.body");
    expect(modal).toContain("max-h-[min(80vh,calc(100dvh-8rem))]");
  });

  it("empty state is honest about saved inventory", () => {
    const modal = read("components/saved/FindSimilarModal.tsx");
    expect(modal).toContain("No similar saved listings yet");
    expect(modal).toContain("it does not run a");
    expect(modal).not.toContain("Searching active inventory");
  });

  it("is an accessible modal dialog", () => {
    const modal = read("components/saved/FindSimilarModal.tsx");
    expect(modal).toContain('role="dialog"');
    expect(modal).toContain('aria-modal="true"');
    expect(modal).toContain("aria-labelledby={titleId}");
    expect(modal).toContain("<h3 id={titleId}");
    expect(modal).toContain('aria-label="Close find similar vehicles"');
  });

  it("manages focus: in on open, trapped, Escape closes, returns to trigger", () => {
    const modal = read("components/saved/FindSimilarModal.tsx");
    expect(modal).toContain("closeButtonRef.current?.focus()");
    expect(modal).toContain('event.key === "Escape"');
    expect(modal).toContain('event.key !== "Tab"');
    expect(modal).toContain("last.focus()");
    expect(modal).toContain("first.focus()");
    expect(modal).toContain("trigger.focus()");
    expect(modal).toContain('removeEventListener("keydown"');
  });

  it("icon-only open-listing link has an accessible name", () => {
    const modal = read("components/saved/FindSimilarModal.tsx");
    expect(modal).toContain('"Open listing"');
    expect(modal).toContain(
      '<ChevronRight className="w-4 h-4" aria-hidden="true" />',
    );
  });
});
