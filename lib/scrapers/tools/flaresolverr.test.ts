import { describe, it, expect } from "vitest";
import { FlareSolverrClient } from "./flaresolverr";
import { BypassRetiredError } from "../retired";

describe("FlareSolverrClient (retired)", () => {
  it("never reports configured, even with a URL", () => {
    expect(new FlareSolverrClient("").isConfigured()).toBe(false);
    expect(new FlareSolverrClient("http://localhost:8191").isConfigured()).toBe(
      false,
    );
  });

  it("refuses to solve challenges", async () => {
    await expect(
      new FlareSolverrClient("http://localhost:8191").getHtml(
        "https://example.com",
      ),
    ).rejects.toBeInstanceOf(BypassRetiredError);
  });
});
