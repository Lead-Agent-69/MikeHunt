import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateText = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText }));

describe("GET /api/market/analyst generate", () => {
  it("requires a session before generation", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/market/analyst?generate=1"),
    );
    expect(res.status).toBe(401);
    expect(generateText).not.toHaveBeenCalled();
  });
});
