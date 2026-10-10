import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchPublicImage: vi.fn() }));
vi.mock("@/lib/net/fetch-public-image", () => ({
  fetchPublicImage: mocks.fetchPublicImage,
}));

import { GET } from "./route";

const PNG = Buffer.from("89504e470d0a1a0a", "hex");
const get = (u: string) =>
  GET(
    new Request(
      "https://app.test/api/image/proxy?url=" + encodeURIComponent(u),
    ),
  );

beforeEach(() => {
  mocks.fetchPublicImage.mockReset();
  mocks.fetchPublicImage.mockResolvedValue({
    ok: true,
    body: PNG,
    contentType: "image/png",
  });
});

describe("GET /api/image/proxy access-class gate", () => {
  it("data.rebuildautos.com (operator_override, URL-only restore) gets no proxied bytes", async () => {
    const res = await get("https://data.rebuildautos.com/photos/123.jpg");
    expect(res.status).toBe(403);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect(await res.text()).toContain("operator_override");
    expect(mocks.fetchPublicImage).not.toHaveBeenCalled();
  });

  it("an open allowlisted host is still proxied", async () => {
    const res = await get("https://images.craigslist.org/00a_x.jpg");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(mocks.fetchPublicImage).toHaveBeenCalledTimes(1);
  });

  it("redirect hops are re-checked against the access class too", async () => {
    await get("https://images.craigslist.org/00a_x.jpg");
    const hopCheck = mocks.fetchPublicImage.mock.calls[0][1] as (
      u: string,
    ) => boolean;
    expect(hopCheck("https://images.craigslist.org/next.jpg")).toBe(true);
    expect(hopCheck("https://data.rebuildautos.com/photos/1.jpg")).toBe(false);
    expect(hopCheck("http://169.254.169.254/latest")).toBe(false);
  });
});
