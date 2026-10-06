import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp } from "./rate-limit";

function req(headers: Record<string, string>) {
  return new Request("https://app.test/api/scan/parse", { headers });
}

describe("clientIp", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not trust a spoofed first X-Forwarded-For hop outside production", () => {
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.8" }))).toBe(
      "10.0.0.8",
    );
  });

  it("uses x-real-ip outside production when Vercel did not set a client IP", () => {
    expect(
      clientIp(
        req({
          "x-vercel-forwarded-for": "203.0.113.9",
          "x-real-ip": "198.51.100.4",
          "x-forwarded-for": "1.2.3.4",
        }),
      ),
    ).toBe("203.0.113.9");
    expect(
      clientIp(
        req({
          "x-real-ip": "198.51.100.4",
          "x-forwarded-for": "1.2.3.4, 10.0.0.8",
        }),
      ),
    ).toBe("198.51.100.4");
  });

  it("ignores spoofed x-real-ip and x-forwarded-for in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(clientIp(req({ "x-real-ip": "198.51.100.4" }))).toBe("unknown");
    expect(clientIp(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.8" }))).toBe(
      "unknown",
    );
    expect(
      clientIp(
        req({
          "x-real-ip": "1.2.3.4",
          "x-forwarded-for": "198.51.100.4",
          "x-vercel-forwarded-for": "203.0.113.9, 10.0.0.8",
        }),
      ),
    ).toBe("203.0.113.9");
  });
});

describe("rateLimit identity buckets", () => {
  it("buckets by identity instead of IP when given", async () => {
    const { rateLimit } = await import("./rate-limit");
    const opts = { key: "rl-identity-test", limit: 2, windowMs: 60_000, identity: "user:z" };
    expect(rateLimit(req({ "x-real-ip": "198.51.100.1" }), opts).allowed).toBe(true);
    expect(rateLimit(req({ "x-real-ip": "198.51.100.2" }), opts).allowed).toBe(true);
    expect(rateLimit(req({ "x-real-ip": "198.51.100.3" }), opts).allowed).toBe(false);
    expect(
      rateLimit(req({ "x-real-ip": "198.51.100.3" }), { ...opts, identity: "user:y" }).allowed,
    ).toBe(true);
  });
});
