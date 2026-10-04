import { describe, expect, it } from "vitest";
import { clientIp } from "./rate-limit";

function req(headers: Record<string, string>) {
  return new Request("https://app.test/api/scan/parse", { headers });
}

describe("clientIp", () => {
  it("does not trust a spoofed first X-Forwarded-For hop", () => {
    expect(
      clientIp(
        req({ "x-forwarded-for": "1.2.3.4, 10.0.0.8" }),
      ),
    ).toBe("10.0.0.8");
  });

  it("prefers the platform client headers over X-Forwarded-For", () => {
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
});
