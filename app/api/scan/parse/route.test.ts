import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const generateObject = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateObject, generateText: generateObject }));

describe("GET /api/scan/parse", () => {
  it("parses deterministically without any model call", async () => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest(
        "https://app.test/api/scan/parse?q=2015%20ford%20f-150%20under%2015k%20in%20TX",
      ),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      make: "Ford",
      model: "F-150",
      minYear: "2015",
      maxPrice: "15000",
      state: "TX",
    });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("returns an empty object for an empty query", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("https://app.test/api/scan/parse"));
    expect(await res.json()).toEqual({});
  });
});
