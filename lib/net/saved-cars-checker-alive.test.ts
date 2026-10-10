// workers/ isn't in the vitest include, so the checkUrlAlive SSRF test lives with the URL guard.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("dotenv", () => ({ config: () => ({}) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({}) }));

import { checkUrlAlive } from "../../workers/savedCarsChecker";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const res = (status: number, location?: string) =>
  new Response(null, {
    status,
    headers: location ? { location } : undefined,
  });

describe("savedCarsChecker checkUrlAlive SSRF guard", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/",
    "http://127.0.0.1:5432/",
    "http://10.0.0.5/",
    "http://[::1]/",
    "http://localhost/",
    "file:///etc/passwd",
    "http://user:pw@93.184.216.34/",
  ])("refuses %s without sending a request", async (url) => {
    expect(await checkUrlAlive(url)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("HEADs a public URL with redirect: manual", async () => {
    fetchMock.mockResolvedValueOnce(res(200));
    expect(await checkUrlAlive("http://93.184.216.34/listing/1")).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("HEAD");
    expect(init.redirect).toBe("manual");
  });

  it("refuses a public URL that redirects to a private address", async () => {
    fetchMock.mockResolvedValueOnce(res(302, "http://169.254.169.254/"));
    expect(await checkUrlAlive("http://93.184.216.34/r")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("follows a public-to-public redirect, re-checking the hop", async () => {
    fetchMock
      .mockResolvedValueOnce(res(301, "http://93.184.216.35/new"))
      .mockResolvedValueOnce(res(200));
    expect(await checkUrlAlive("http://93.184.216.34/old")).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe("http://93.184.216.35/new");
  });

  it("gives up after too many redirects and treats 404 as dead", async () => {
    fetchMock.mockResolvedValue(res(302, "http://93.184.216.34/loop"));
    expect(await checkUrlAlive("http://93.184.216.34/loop")).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(res(404));
    expect(await checkUrlAlive("http://93.184.216.34/gone")).toBe(false);
  });
});
