import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { EmptyState } from "@/components/shared/EmptyState";

vi.mock("next/link", () => ({ default: "a" }));

const props = {
  icon: "search" as const,
  title: "No vehicles",
  message: "Adjust your search.",
};

it("does not offer a dead action without a destination or handler", () => {
  const html = renderToStaticMarkup(
    React.createElement(EmptyState, {
      ...props,
      action: { label: "Try again" },
    }),
  );
  expect(html).not.toContain("<button");
  expect(html).not.toContain("Try again");
});

it("uses a real link for navigation", () => {
  const html = renderToStaticMarkup(
    React.createElement(EmptyState, {
      ...props,
      action: { label: "Discover", href: "/discover" },
    }),
  );
  expect(html).toContain('href="/discover"');
  expect(html).toContain("focus-visible:outline");
});

it("does not submit a surrounding form and respects reduced-motion styling", () => {
  const html = renderToStaticMarkup(
    React.createElement(EmptyState, {
      ...props,
      action: { label: "Retry", onClick: vi.fn() },
    }),
  );
  expect(html).toContain('type="button"');
  expect(html).toContain("motion-safe:active:scale-95");
  expect(html).not.toContain("animation:");
});
