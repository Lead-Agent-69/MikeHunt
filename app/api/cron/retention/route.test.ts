import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  createServerComponentClient: () => ({ rpc }),
}));

import { GET } from "./route";

const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/retention", {
    headers: auth ? { authorization: auth } : {},
  });

afterEach(() => {
  delete process.env.CRON_SECRET;
  rpc.mockReset();
});

describe("GET /api/cron/retention", () => {
  it("is locked without the cron secret", async () => {
    process.env.CRON_SECRET = "s3cret";
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("runs retention then the VIN cache purge and reports both", async () => {
    process.env.CRON_SECRET = "s3cret";
    rpc
      .mockResolvedValueOnce({ data: { page_views: 3 }, error: null })
      .mockResolvedValueOnce({
        data: [{ vin_rows: 2, recall_rows: 1 }],
        error: null,
      });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: { page_views: 3 },
      vinCache: { vin_rows: 2, recall_rows: 1 },
    });
    expect(rpc).toHaveBeenNthCalledWith(1, "run_retention");
    expect(rpc).toHaveBeenNthCalledWith(2, "purge_expired_vin_cache");
  });

  it("still answers 200 when the VIN cache purge is missing or fails", async () => {
    process.env.CRON_SECRET = "s3cret";
    rpc
      .mockResolvedValueOnce({ data: { page_views: 1 }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "function purge_expired_vin_cache() does not exist" },
      });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      deleted: { page_views: 1 },
      vinCache: null,
    });
  });

  it("does not purge the VIN cache when run_retention fails", async () => {
    process.env.CRON_SECRET = "s3cret";
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(500);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
