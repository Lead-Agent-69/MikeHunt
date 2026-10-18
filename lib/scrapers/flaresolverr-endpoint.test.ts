import { describe, expect, it } from "vitest";
import {
  flareSolverrApiUrl,
  flareSolverrHealthUrl,
  normalizeFlareSolverrBaseUrl,
} from "./flaresolverr-endpoint";

describe("FlareSolverr endpoint normalization", () => {
  it.each([
    "http://flaresolverr:8191",
    "http://flaresolverr:8191/",
    "http://flaresolverr:8191/v1",
    "http://flaresolverr:8191/v1/",
    "http://flaresolverr:8191/v1/v1",
  ])("builds one command endpoint from %s", (configuredUrl) => {
    expect(flareSolverrApiUrl(configuredUrl)).toBe(
      "http://flaresolverr:8191/v1",
    );
  });

  it("builds health from the service root even when /v1 was configured", () => {
    expect(flareSolverrHealthUrl("http://localhost:8191/v1")).toBe(
      "http://localhost:8191/health",
    );
  });

  it("keeps an empty configuration empty", () => {
    expect(normalizeFlareSolverrBaseUrl()).toBe("");
    expect(flareSolverrApiUrl()).toBe("");
  });
});
