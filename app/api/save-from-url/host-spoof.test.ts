// @vitest-environment node
// Ren P1: detectSource matched a substring of the whole URL, so
// https://attacker.example/lot/<real lot>?copart.com was saved as source "copart". The upsert key is
// source + source_deal_id, so that save could overwrite the real Copart row. This drives the real
// route + real scrapeOrParseListing against an in-memory deals table.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const axiosGet = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { get: axiosGet } }));
vi.mock("dns/promises", () => {
  const lookup = vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]);
  return { lookup, default: { lookup } };
});

type Row = Record<string, any>;
const deals = vi.hoisted(() => new Map<string, Row>());
const key = (source: string, id: string) => `${source}::${id}`;

vi.mock("@/lib/server-supabase", () => ({
  getServerUser: async () => ({ data: { user: { id: "user-a" } } }),
}));
vi.mock("@/lib/scrapers/pipeline", () => ({
  // Same conflict key as the real pipeline: source + source_deal_id.
  upsertDeals: vi.fn(async (rows: Row[]) => {
    for (const r of rows) {
      const k = key(r.source, r.source_deal_id);
      deals.set(k, {
        ...(deals.get(k) || { id: `deal-${deals.size + 1}` }),
        ...r,
      });
    }
  }),
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({
    from: (table: string) => {
      const filters: Record<string, unknown> = {};
      const q: any = {};
      for (const m of ["select", "upsert", "insert", "update"]) q[m] = () => q;
      q.eq = (col: string, val: unknown) => {
        filters[col] = val;
        return q;
      };
      q.maybeSingle = async () => {
        if (table !== "deals") return { data: null };
        const row = deals.get(
          key(String(filters.source), String(filters.source_deal_id)),
        );
        return { data: row ? { id: row.id } : null };
      };
      q.single = async () => ({ data: { id: "saved-1" }, error: null });
      q.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: null, error: null });
      return q;
    },
  }),
}));

import { POST } from "./route";

const REAL_LOT = "12345678";
const REAL_COPART_ROW: Row = {
  id: "real-copart",
  source: "copart",
  source_deal_id: REAL_LOT,
  source_url: `https://www.copart.com/lot/${REAL_LOT}`,
  title: "2020 Ford F-150 XLT",
  ask_price: 9100,
  images: ["https://cs.copart.com/real.jpg"],
};

function page(html: string) {
  axiosGet.mockResolvedValue({ status: 200, headers: {}, data: html });
}

async function save(url: string) {
  return POST(
    new NextRequest("https://x.test/api/save-from-url", {
      method: "POST",
      body: JSON.stringify({ url }),
      headers: {
        "content-type": "application/json",
        "x-real-ip": "198.51.100.9",
      },
    }),
  );
}

describe("save-from-url cannot claim a source it was not served from", () => {
  beforeEach(() => {
    deals.clear();
    deals.set(key("copart", REAL_LOT), { ...REAL_COPART_ROW });
    axiosGet.mockReset();
  });

  it("an attacker URL carrying a real Copart lot does not touch the real row", async () => {
    page(`<html><head>
      <meta property="og:price:amount" content="1">
      <meta property="og:image" content="https://attacker.example/fake.jpg">
      </head><body>scam</body></html>`);
    await save(
      `https://attacker.example/lot/${REAL_LOT}/2020-ford-f150?copart.com`,
    );
    expect(deals.get(key("copart", REAL_LOT))).toEqual(REAL_COPART_ROW);
    for (const row of Array.from(deals.values())) {
      if (row.id === "real-copart") continue;
      expect(row.source).not.toBe("copart");
      expect(row.source_deal_id).not.toBe(REAL_LOT);
    }
  });

  it("an attacker page dressed as Craigslist is not saved as craigslist", async () => {
    page(`<html><span class="price">$500</span>
      <span id="titletextonly">2018 Ford F-150</span></html>`);
    const res = await save(
      "https://attacker.example/2018-ford-f150/?craigslist.org",
    );
    // Not craigslist, so the craigslist price parser never runs: no ask on the page → 422.
    expect(res.status).toBe(422);
    const saved = Array.from(deals.values()).filter(
      (r) => r.id !== "real-copart",
    );
    expect(saved).toHaveLength(0);
  });

  it("a non-http URL is rejected before any fetch", async () => {
    const res = await save("javascript:alert(1)//copart.com");
    expect(res.status).toBe(400);
    expect(axiosGet).not.toHaveBeenCalled();
  });
});
