import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const swr = vi.hoisted(() => ({ data: {} as Record<string, unknown> }));
vi.mock("swr", () => ({
  default: () => ({ data: swr.data, mutate: vi.fn() }),
}));
import { AIBrief } from "@/components/deal/AIBrief";

beforeEach(() => {
  swr.data = {};
});
it("labels an incomplete-evidence checklist without offering paid generation", () => {
  swr.data = {
    brief: "Needs evidence. Confirm the title documents.",
    canGenerate: false,
    evidenceReady: false,
    mode: "deterministic",
    provider: "none",
  };
  const html = renderToStaticMarkup(
    React.createElement(AIBrief, { dealId: "one" }),
  );
  expect(html).toContain("Needs evidence");
  expect(html).toContain("Confirm the title documents");
  expect(html).not.toContain("Math fallback");
  expect(html).not.toContain("Refresh");
  expect(html).not.toContain("Generate");
});

it("keeps explicit generation available when evidence permits it", () => {
  swr.data = {
    brief: "Qualified estimate.",
    provider: "anthropic",
    cached: true,
  };
  const html = renderToStaticMarkup(
    React.createElement(AIBrief, { dealId: "one" }),
  );
  expect(html).toContain("ANTHROPIC AI");
  expect(html).toContain("Refresh");
});
