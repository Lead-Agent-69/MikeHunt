import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const viewer = vi.hoisted(() => ({ isAdmin: false }));
vi.mock("@/hooks/useIsAdmin", () => ({ useIsAdmin: () => viewer }));
vi.mock("swr", () => ({
  default: () => ({ data: undefined, error: undefined, mutate: vi.fn() }),
}));
import SourcesPage from "@/app/(dashboard)/sources/page";

describe("customer source coverage", () => {
  it("keeps operational catalog metrics out of the normal buyer page", () => {
    viewer.isAdmin = false;
    const html = renderToStaticMarkup(<SourcesPage />);
    expect(html).not.toContain('aria-label="Source operations metrics"');
    expect(html).toContain("Results coverage");
    expect(html).toContain("Check for new matches");
    expect(html).toContain("Browse source directory");
    expect(html).not.toContain('aria-label="Source directory"');
  });
  it("retains operational metrics for a server-verified admin", () => {
    viewer.isAdmin = true;
    expect(renderToStaticMarkup(<SourcesPage />)).toContain(
      'aria-label="Source operations metrics"',
    );
  });
});
