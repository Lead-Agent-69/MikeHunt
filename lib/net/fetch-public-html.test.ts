import { beforeEach, describe, expect, it, vi } from "vitest";

const axiosGet = vi.hoisted(() => vi.fn());

vi.mock("axios", () => ({
  default: { get: axiosGet },
}));

vi.mock("dns/promises", () => {
  const lookup = vi.fn(async (hostname: string) => {
    if (hostname === "listings.example") {
      return [{ address: "93.184.216.34", family: 4 }];
    }
    throw Object.assign(new Error("nxdomain"), { code: "ENOTFOUND" });
  });
  return { lookup, default: { lookup } };
});

import { UrlNotAllowedError } from "./public-url";
import { fetchPublicHtml } from "./fetch-public-html";

describe("fetchPublicHtml", () => {
  beforeEach(() => {
    axiosGet.mockReset();
  });

  it("does not request a metadata address", async () => {
    await expect(
      fetchPublicHtml("http://169.254.169.254/latest/meta-data"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).not.toHaveBeenCalled();
  });

  it("does not follow a redirect onto a metadata address", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "http://169.254.169.254/latest/meta-data" },
      data: "",
    });
    await expect(
      fetchPublicHtml("https://listings.example/ford/escape"),
    ).rejects.toBeInstanceOf(UrlNotAllowedError);
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(String(axiosGet.mock.calls[0][0])).toContain("listings.example");
  });

  it("returns null when the public fetch fails", async () => {
    axiosGet.mockRejectedValueOnce(new Error("timeout"));
    await expect(
      fetchPublicHtml("https://listings.example/ford/escape"),
    ).resolves.toBeNull();
  });
  it("checks page policy before each redirect request", async () => {
    axiosGet.mockResolvedValueOnce({
      status: 302,
      headers: { location: "/forbidden" },
      data: "",
    });
    const allowed = vi.fn(async (url: string) => !url.endsWith("/forbidden"));
    await expect(
      fetchPublicHtml("https://listings.example/inventory", allowed),
    ).rejects.toThrow("source policy");
    expect(axiosGet).toHaveBeenCalledTimes(1);
    expect(allowed).toHaveBeenCalledTimes(2);
  });
});
