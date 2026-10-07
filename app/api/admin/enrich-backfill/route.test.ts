import { describe, expect, it } from "vitest";
import { isCraigslistDetailUrl } from "./route";

describe("isCraigslistDetailUrl", () => {
  it("allows craigslist hosts only", () => {
    expect(
      isCraigslistDetailUrl("https://dallas.craigslist.org/cto/d/x/1.html"),
    ).toBe(true);
    expect(isCraigslistDetailUrl("https://craigslist.org/about")).toBe(true);
    expect(isCraigslistDetailUrl("https://www.craigslist.org/cto/d/x")).toBe(
      true,
    );
  });

  it("refuses private, metadata, and non-CL hosts", () => {
    expect(isCraigslistDetailUrl("http://127.0.0.1/")).toBe(false);
    expect(isCraigslistDetailUrl("http://169.254.169.254/latest")).toBe(false);
    expect(isCraigslistDetailUrl("https://evil.example/craigslist.org")).toBe(
      false,
    );
    expect(isCraigslistDetailUrl("not a url")).toBe(false);
  });
});
