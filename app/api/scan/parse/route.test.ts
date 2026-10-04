import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateObject = vi.hoisted(() => vi.fn());

vi.mock("ai", () => ({ generateObject }));
vi.mock("@ai-sdk/openai", () => ({ openai: () => "model" }));

describe("GET /api/scan/parse", () => {
  it("does not spend a model without a session", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest("https://app.test/api/scan/parse?q=ford%20under%2015000"),
    );
    expect(res.status).toBe(401);
    expect(generateObject).not.toHaveBeenCalled();
  });
});
