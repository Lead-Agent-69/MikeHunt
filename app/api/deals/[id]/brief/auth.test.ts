import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText }));

describe("GET /api/deals/[id]/brief generate", () => {
  it("requires a session before generation", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/deals/deal-1/brief?generate=1"),
      { params: Promise.resolve({ id: "deal-1" }) },
    );
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });
});
