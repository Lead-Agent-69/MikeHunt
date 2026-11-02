import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("@/hooks/useBuyerIntent", () => ({
  useBuyerIntent: () => ({ intent: { buyerMode: "reseller" } }),
}));
vi.mock("@/hooks/useDealerId", () => ({
  useDealerId: () => ({ dealerId: "owner-fixture", loading: false }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    prefetch: _prefetch,
    children,
    ...props
  }: React.PropsWithChildren<{ href: string; prefetch?: boolean }>) => {
    void _prefetch;
    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  },
}));
import ToolsPage from "./(dashboard)/tools/page";

it("keeps the owner tool directory searchable without workspace upsells", () => {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(<ToolsPage />);
  expect(host.querySelector('[aria-label="Find a tool"]')).not.toBeNull();
  expect(
    host.querySelector('a[href="/settings#buying-preferences"]'),
  ).not.toBeNull();
  expect(host.querySelector('a[href="/map"]')).not.toBeNull();
  expect(host.querySelector('a[href="/upgrade"]')).toBeNull();
  expect(host.textContent).not.toContain("Workspace options");
});
