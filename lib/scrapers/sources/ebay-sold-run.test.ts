import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({ urls: [] as string[] }));

vi.mock("node:child_process", () => ({
  execFile: (
    _cmd: string,
    args: string[],
    opts: unknown,
    cb?: (e: unknown, r: { stdout: string; stderr: string }) => void,
  ) => {
    const done = (typeof opts === "function" ? opts : cb) as (
      e: unknown,
      r: { stdout: string; stderr: string },
    ) => void;
    const url = args[args.length - 1];
    calls.urls.push(url);
    const body =
      '<html><head><title>Error Page | eBay</title></head><body>SORRY</body></html>';
    done(null, { stdout: `${body}\n__HTTP_STATUS__:403`, stderr: "" });
  },
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => {
      const q: any = {
        select: () => q,
        eq: () => q,
        gt: () => q,
        order: () => q,
        range: async () => ({ data: [], error: null }),
      };
      return q;
    },
  }),
}));

import { scrapeEbaySold } from "./ebay-sold";

describe("scrapeEbaySold on eBay's 403 edge page", () => {
  beforeEach(() => {
    calls.urls = [];
  });

  it("stops after the first blocked search and fails the run honestly", async () => {
    await expect(scrapeEbaySold()).rejects.toThrow(
      /challenged: www\.ebay\.com HTTP 403; 0 sold rows/,
    );
    const searches = calls.urls.filter((u) => u.includes("/sch/"));
    expect(searches).toHaveLength(1);
  });
});
