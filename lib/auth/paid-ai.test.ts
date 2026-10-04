import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-supabase", () => ({
  getServerUser,
}));

import { requirePaidAiCaller } from "./paid-ai";

describe("requirePaidAiCaller", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    process.env.CRON_SECRET = "cron-test-secret";
  });

  it("rejects an anonymous caller", async () => {
    getServerUser.mockResolvedValue({ data: { user: null }, error: null });
    const result = await requirePaidAiCaller(
      new NextRequest("https://app.test/api/scan/parse?q=ford"),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("accepts a session", async () => {
    getServerUser.mockResolvedValue({
      data: { user: { id: "user-1" } },
      error: null,
    });
    const result = await requirePaidAiCaller(
      new NextRequest("https://app.test/api/deals/1/brief?generate=1"),
    );
    expect(result).toEqual({ ok: true, userId: "user-1" });
  });

  it("accepts a cron bearer", async () => {
    getServerUser.mockResolvedValue({ data: { user: null }, error: null });
    const header = await requirePaidAiCaller(
      new NextRequest("https://app.test/api/market/analyst?generate=1", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );
    expect(header).toEqual({ ok: true, userId: "cron" });
    expect(getServerUser).not.toHaveBeenCalled();
  });
});
