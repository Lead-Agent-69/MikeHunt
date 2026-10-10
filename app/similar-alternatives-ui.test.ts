import { createElement } from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
const swr = vi.hoisted(() => ({ result: {} as any, fetcher: null as any }));
vi.mock("swr", () => ({
  default: (_key: unknown, fetcher: unknown) => {
    swr.fetcher = fetcher;
    return { ...swr.result, mutate: vi.fn() };
  },
}));
import { SimilarDeals } from "@/components/deal/SimilarDeals";
const render = () =>
  renderToStaticMarkup(createElement(SimilarDeals, { dealId: "base" }));
describe("alternative feedback", () => {
  it("keeps alternatives outside collapsed specialist tools", () => {
    const page = readFileSync("app/(dashboard)/deal/[id]/page.tsx", "utf8");
    expect(
      page.indexOf('<section aria-label="Current alternatives">'),
    ).toBeLessThan(page.indexOf('eyebrow="Vehicle examination"'));
    expect(page.match(/<SimilarDeals /g)).toHaveLength(1);
  });
  beforeEach(() => {
    swr.result = {};
    vi.unstubAllGlobals();
  });
  it("shows loading, empty and failure as distinct states", () => {
    swr.result = { isLoading: true };
    expect(render()).toContain("Finding current alternatives");
    swr.result = { data: { similar: [] } };
    expect(render()).toContain("No recently seen alternatives");
    swr.result = { error: new Error("offline") };
    expect(render()).toContain("Alternatives unavailable");
  });
  it("shows price basis and observed match reasons without an unsupported buy verdict", () => {
    swr.result = {
      data: {
        similar: [
          {
            id: "other",
            source: "copart",
            askPrice: 500,
            year: 2020,
            make: "Toyota",
            model: "Camry",
            dealVerdict: "go",
            matchReasons: ["Same year"],
            condition: "salvage",
          },
        ],
      },
    };
    const html = render();
    expect(html).toContain("Current bid");
    expect(html).toContain("Same year");
    expect(html).toContain("salvage reported");
    expect(html).not.toContain(">go<");
    expect(html).not.toContain("AI-matched");
  });
  it("does not treat a failed request as no alternatives", async () => {
    render();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await expect(swr.fetcher("/api/test")).rejects.toThrow(
      "Alternatives couldn't be loaded",
    );
  });
});
