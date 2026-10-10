import { beforeEach, describe, expect, it, vi } from "vitest";
import axios from "axios";
import { assertSourceAccess } from "../access-policy";
import { assertPublicHttpUrl } from "@/lib/net/public-url";
import { fetchApprovedPublicResponse } from "./public-fetch";

vi.mock("axios", () => ({ default: { get: vi.fn() } }));
vi.mock("../access-policy", () => ({ assertSourceAccess: vi.fn() }));
vi.mock("@/lib/net/public-url", () => ({ assertPublicHttpUrl: vi.fn() }));
vi.mock("@/lib/net/fetch-public-html", () => ({
  publicHttpAgent: {},
  publicHttpsAgent: {},
}));

describe("approved public HTTP transport", () => {
  beforeEach(() => vi.resetAllMocks());

  it("does not open a connection without permission", async () => {
    vi.mocked(assertSourceAccess).mockImplementation(() => {
      throw new Error("permission required");
    });
    await expect(
      fetchApprovedPublicResponse("https://dealer.example/car"),
    ).rejects.toThrow("permission");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("does not open a connection to rejected network addresses", async () => {
    vi.mocked(assertPublicHttpUrl).mockRejectedValue(
      new Error("private network"),
    );
    await expect(
      fetchApprovedPublicResponse("https://dealer.example/car"),
    ).rejects.toThrow("private network");
    expect(axios.get).not.toHaveBeenCalled();
  });

  it("does not follow redirects and bounds response size", async () => {
    vi.mocked(axios.get).mockResolvedValue({
      status: 302,
      data: "redirect",
      headers: { location: "http://127.0.0.1/", "set-cookie": "secret" },
    });
    const result = await fetchApprovedPublicResponse(
      "https://dealer.example/car",
    );
    expect(result.status).toBe(302);
    expect(axios.get).toHaveBeenCalledWith(
      "https://dealer.example/car",
      expect.objectContaining({
        maxRedirects: 0,
        maxContentLength: 2 * 1024 * 1024,
        timeout: 30_000,
      }),
    );
    expect(result.headers.has("set-cookie")).toBe(false);
  });
});
