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

  it("runs one retention RPC and reports counts", async () => {
    process.env.CRON_SECRET = "s3cret";
    rpc.mockResolvedValue({ data: { page_views: 3 }, error: null });
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: { page_views: 3 } });
    expect(rpc).toHaveBeenCalledWith("run_retention");
  });
});
