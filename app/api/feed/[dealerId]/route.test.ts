import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const getServerUser = vi.hoisted(() => vi.fn());
const from = vi.hoisted(() => vi.fn());

vi.mock("@/lib/server-supabase", () => ({ getServerUser }));
vi.mock("@/lib/supabase", () => ({
  createServerComponentClient: () => ({ from }),
}));

describe("GET /api/feed/[dealerId]", () => {
  beforeEach(() => {
    getServerUser.mockReset();
    from.mockReset();
  });

  it("does not return another dealer's inventory", async () => {
    getServerUser.mockResolvedValue({
      data: { user: { id: "dealer-a" } },
      error: null,
    });
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/feed/dealer-b"),
      {
        params: Promise.resolve({ dealerId: "dealer-b" }),
      },
    );
    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it("requires a session", async () => {
    getServerUser.mockResolvedValue({ data: { user: null }, error: null });
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/feed/dealer-a"),
      {
        params: Promise.resolve({ dealerId: "dealer-a" }),
      },
    );
    expect(res.status).toBe(401);
    expect(from).not.toHaveBeenCalled();
  });
});
