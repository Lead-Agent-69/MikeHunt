// workers/ isn't in the vitest include, so the checkUrlAlive tests live with the URL guard.
import { beforeEach, describe, expect, it, vi } from "vitest";

const pinnedRequest = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  saves: [] as any[],
}));

vi.mock("dotenv", () => ({ config: () => ({}) }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      const q: any = {
        select: () => q,
        in: () => q,
        order: () => q,
        limit: async () => ({ data: db.saves, error: null }),
        eq: () => q,
        maybeSingle: async () => ({ data: null, error: null }), // deal gone → URL probe
        update: (patch: Record<string, unknown>) => {
          if (table === "saved_cars") db.updates.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
      return q;
    },
  }),
}));
vi.mock("./pinned-dns", async (orig) => ({
  ...(await orig<typeof import("./pinned-dns")>()),
  pinnedRequest,
}));

import { checkSavedCars, checkUrlAlive } from "../../workers/savedCarsChecker";

const res = (status: number, location?: string) => ({
  status,
  headers: location ? { location } : {},
  url: "",
});

beforeEach(() => {
  pinnedRequest.mockReset();
  db.updates = [];
  db.saves = [];
});

describe("checkUrlAlive → alive / dead / unknown", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:5432/",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://localhost/",
    "file:///etc/passwd",
    "http://user:pw@93.184.216.34/",
  ])("guard refusal of %s is unknown, with no request sent", async (url) => {
    expect(await checkUrlAlive(url)).toBe("unknown");
    expect(pinnedRequest).not.toHaveBeenCalled();
  });

  it("2xx is alive, sent as a pinned HEAD", async () => {
    pinnedRequest.mockResolvedValueOnce(res(200));
    expect(await checkUrlAlive("http://93.184.216.34/listing/1")).toBe("alive");
    const [target, init] = pinnedRequest.mock.calls[0];
    expect(target.addresses).toEqual([{ address: "93.184.216.34", family: 4 }]);
    expect(init.method).toBe("HEAD");
  });

  it.each([404, 410])("%s is dead", async (status) => {
    pinnedRequest.mockResolvedValueOnce(res(status));
    expect(await checkUrlAlive("http://93.184.216.34/gone")).toBe("dead");
  });

  it.each([403, 429, 500, 503])("%s is unknown", async (status) => {
    pinnedRequest.mockResolvedValueOnce(res(status));
    expect(await checkUrlAlive("http://93.184.216.34/x")).toBe("unknown");
  });

  it("network error / timeout is unknown", async () => {
    pinnedRequest.mockRejectedValueOnce(new Error("timeout"));
    expect(await checkUrlAlive("http://93.184.216.34/x")).toBe("unknown");
  });

  it("redirect onto a private address is unknown and that hop is never requested", async () => {
    pinnedRequest.mockResolvedValueOnce(res(302, "http://169.254.169.254/"));
    expect(await checkUrlAlive("http://93.184.216.34/r")).toBe("unknown");
    expect(pinnedRequest).toHaveBeenCalledTimes(1);
  });

  it("follows a public redirect, re-pinning the new host", async () => {
    pinnedRequest
      .mockResolvedValueOnce(res(301, "http://93.184.216.35/new"))
      .mockResolvedValueOnce(res(200));
    expect(await checkUrlAlive("http://93.184.216.34/old")).toBe("alive");
    expect(pinnedRequest.mock.calls[1][0].addresses[0].address).toBe(
      "93.184.216.35",
    );
  });

  it("redirect loop is unknown after 4 requests", async () => {
    pinnedRequest.mockResolvedValue(res(302, "http://93.184.216.34/loop"));
    expect(await checkUrlAlive("http://93.184.216.34/loop")).toBe("unknown");
    expect(pinnedRequest).toHaveBeenCalledTimes(4);
  });
});

describe("checkSavedCars status writes", () => {
  const save = (source_url: string) => ({
    id: "s1",
    deal_id: "d1",
    source_url,
    source_name: "x",
    last_price_seen: 1000,
    status: "active",
  });

  it("unknown (guard refusal) leaves status alone, only bumps last_checked", async () => {
    db.saves = [save("http://169.254.169.254/")];
    await checkSavedCars();
    expect(db.updates).toHaveLength(1);
    expect(Object.keys(db.updates[0])).toEqual(["last_checked"]);
  });

  it("unknown (503) leaves status alone", async () => {
    db.saves = [save("http://93.184.216.34/x")];
    pinnedRequest.mockResolvedValueOnce(res(503));
    await checkSavedCars();
    expect(db.updates.map((u) => u.status)).toEqual([undefined]);
  });

  it("dead (404) marks unavailable; alive marks active", async () => {
    db.saves = [save("http://93.184.216.34/x")];
    pinnedRequest.mockResolvedValueOnce(res(404));
    await checkSavedCars();
    expect(db.updates[0]).toMatchObject({
      status: "unavailable",
      notified_unavailable: true,
    });
    db.updates = [];
    pinnedRequest.mockResolvedValueOnce(res(200));
    await checkSavedCars();
    expect(db.updates[0]).toMatchObject({ status: "active" });
  });
});
