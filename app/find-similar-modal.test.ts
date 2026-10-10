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
});
