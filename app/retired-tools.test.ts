import { existsSync, readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { GET as bulk } from "./api/bulk/route";
import {
  GET as lenders,
  POST as createLender,
} from "./api/finance/lenders/route";
import {
  accountMenuForMode,
  MORE_GROUPS,
  workspaceGroupsForMode,
} from "@/components/layout/nav-items";
import { FOCUSED_TOOLS } from "@/lib/workspace";
import { FLIP_TOOL_ROUTES } from "@/lib/buyer/flip-tool-access";

const retired = ["/list", "/finance", "/bulk"];

describe("retired non-sourcing tools", () => {
  it("removes the old screens rather than merely hiding them", () => {
    for (const route of retired) {
      expect(existsSync(`app/(dashboard)${route}/page.tsx`)).toBe(false);
      expect(existsSync(`app/(dashboard)${route}/layout.tsx`)).toBe(false);
      expect(FOCUSED_TOOLS.has(route)).toBe(false);
      expect(Object.keys(FLIP_TOOL_ROUTES)).not.toContain(route);
    }
    expect(
      readFileSync("app/(dashboard)/fleet/page.tsx", "utf8"),
    ).not.toContain('href="/list"');
  });

  it("cannot resurrect retired tools through any buyer role or workspace search", () => {
    const catalog = MORE_GROUPS.flatMap((g) => g.items.map((i) => i.href));
    for (const route of retired) expect(catalog).not.toContain(route);
    for (const mode of [
      undefined,
      "personal",
      "diy",
      "parts",
      "reseller",
      "dealer",
    ]) {
      const menu = accountMenuForMode(mode);
      const hrefs = [...menu.primary, ...menu.tools, ...menu.secondary].map(
        (i) => i.href.split("?")[0],
      );
      for (const expanded of [false, true]) {
        const workspace = workspaceGroupsForMode(mode, expanded).flatMap((g) =>
          g.items.map((i) => i.href.split("?")[0]),
        );
        for (const route of retired) {
          expect(hrefs).not.toContain(route);
          expect(workspace).not.toContain(route);
        }
        expect(workspace).toContain("/scan");
        expect(workspace).toContain("/saved");
        expect(workspace).toContain("/compare");
        expect(workspace).toContain("/dealer-network");
      }
    }
  });

  it("redirects old bookmarks and search aliases directly to a surviving workflow", async () => {
    const configModule = {
      exports: {} as {
        redirects: () => Promise<
          Array<{ source: string; destination: string }>
        >;
      },
    };
    runInNewContext(readFileSync("next.config.js", "utf8"), {
      module: configModule,
      require: (name: string) => {
        if (name !== "@sentry/nextjs")
          throw new Error(`Unexpected config import: ${name}`);
        return { withSentryConfig: (config: unknown) => config };
      },
      process: { env: {} },
      __dirname: process.cwd(),
    });
    const redirects = await configModule.exports.redirects();
    for (const [source, destination] of [
      ["/list", "/fleet"],
      ["/finance", "/fleet"],
      ["/bulk", "/scan"],
      ["/syndicate", "/fleet"],
      ["/deals", "/scan"],
    ]) {
      expect(redirects.find((r) => r.source === source)?.destination).toBe(
        destination,
      );
    }
    for (const redirect of redirects)
      expect(retired).not.toContain(redirect.destination);
  });

  it.each([bulk, lenders, createLender])(
    "returns explicit Gone responses without reading or changing user data",
    async (handler) => {
      const response = handler();
      expect(response.status).toBe(410);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toMatchObject({
        error: expect.stringContaining("retired"),
        replacement: expect.stringMatching(/^\/(scan|fleet)$/),
      });
    },
  );

  it("distinguishes search views from evaluation and labels specialist tools honestly", () => {
    const groups = workspaceGroupsForMode("dealer");
    expect(
      groups.find((g) => g.group === "Search views")?.items.map((i) => i.href),
    ).toEqual(["/feed", "/map", "/swipe"]);
    const tools = accountMenuForMode("dealer").tools;
    expect(tools.find((i) => i.href === "/find")?.name).toBe(
      "Arbitrage routes",
    );
    expect(tools.find((i) => i.href.startsWith("/scan?"))?.name).toBe(
      "Search cars",
    );
  });
});
