import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

describe("GET /api/vin/[vin]", () => {
  it.each([
    "1HGCM82633A/../x",
    "ABC",
    "1HGCM82633A004352?x=1",
    "IOQ45678901234567",
  ])("rejects %s before any upstream fetch", async (vin) => {
    const { GET } = await import("./route");
    const res = await GET(
      new NextRequest(`http://localhost/api/vin/${encodeURIComponent(vin)}`),
      { params: Promise.resolve({ vin }) },
    );
    expect(res.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
