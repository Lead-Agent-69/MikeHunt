import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  calls: [] as string[][],
  n: 0,
  upserts: [] as Record<string, unknown>[][],
}));

const card = (id: string) => `
<div class="s-card">
  <div class="s-card__title"><span>2018 Ford F-150 XLT SuperCrew</span></div>
  <div class="s-card__subtitle">Pre-Owned · 98,000 miles</div>
  <span class="s-card__price">$18,600.00</span>
  <a class="s-card__link" href="https://www.ebay.com/itm/${id}?hash=x"></a>
  <div class="s-card__caption">Sold  Apr 28, 2026</div>
</div>`;

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
    st.calls.push(args);
    st.n += 1;
    if (st.n === 1)
      return done(null, {
        stdout: `<html><body>${card("315000000101")}${card("315000000102")}</body></html>\n__HTTP_STATUS__:200`,
        stderr: "",
      });
    done(null, {
      stdout:
        "<html><head><title>Error Page | eBay</title></head><body>SORRY</body></html>\n__HTTP_STATUS__:403",
      stderr: "",
    });
  },
}));

vi.mock("./local-sold-cache", () => ({
  loadSoldItemCache: async () => new Set<string>(),
  saveSoldItemCache: async () => undefined,
  soldCacheScope: () => "test",
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
        upsert: (rows: Record<string, unknown>[]) => {
          st.upserts.push(rows);
          return {
            select: async () => ({
              data: rows.map((r) => ({ source_item_id: r.source_item_id })),
              error: null,
            }),
          };
        },
      };
      return q;
    },
  }),
}));

import {
  EBAY_SOLD_MAX_BYTES,
  ebaySoldCurlArgs,
  scrapeEbaySold,
  soldDelayMs,
} from "./ebay-sold";

describe("eBay sold: honest client (Ren's scraper honesty rules)", () => {
  it("uses the MikeHunt bot UA, no Referer, no cookies, https only, capped size and redirects", () => {
    const args = ebaySoldCurlArgs("https://www.ebay.com/sch/i.html?_nkw=x");
    const ua = args[args.indexOf("-A") + 1];
    expect(ua).toMatch(/^MikeHuntBot\/1\.0 \(\+https?:\/\/.+\/bot\)$/);
    expect(args.join(" ")).not.toMatch(/Referer|Mozilla|Chrome/i);
    expect(args).not.toContain("-b");
    expect(args).not.toContain("-c");
    expect(args[args.indexOf("--proto") + 1]).toBe("=https");
    expect(args[args.indexOf("--proto-redir") + 1]).toBe("=https");
    expect(args[args.indexOf("--max-redirs") + 1]).toBe("3");
    expect(args[args.indexOf("--max-filesize") + 1]).toBe(
      String(EBAY_SOLD_MAX_BYTES),
    );
  });

  it("never waits under 4s between searches, even with a tiny EBAY_SOLD_DELAY_MS", () => {
    vi.stubEnv("EBAY_SOLD_DELAY_MS", "10");
    expect(soldDelayMs(() => 0)).toBe(4000);
    vi.unstubAllEnvs();
  });
});

describe("eBay sold: a block after some rows is still recorded as challenged", () => {
  beforeEach(() => {
    st.calls = [];
    st.n = 0;
    st.upserts = [];
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("keeps the rows that came through, then throws challenged; no homepage warm-up, no retry", async () => {
    await expect(scrapeEbaySold()).rejects.toThrow(
      /challenged: www\.ebay\.com HTTP 403 after 2 sold rows parsed \(2 new stored\)/,
    );
    expect(st.upserts).toHaveLength(1);
    expect(st.upserts[0].map((r) => r.source_item_id).sort()).toEqual([
      "315000000101",
      "315000000102",
    ]);
    const urls = st.calls.map((a) => a[a.length - 1]);
    expect(urls.every((u) => u.includes("/sch/"))).toBe(true); // no homepage request
    expect(urls).toHaveLength(2); // stopped at the block
  });
});
