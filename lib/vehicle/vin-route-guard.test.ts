import { describe, expect, it } from "vitest";
import {
  guardVinRoute,
  VIN_DECODE_WRITES_PER_HOUR,
  VIN_USER_LIMIT_PER_MIN,
} from "./vin-route-guard";

const req = (ip: string) =>
  new Request("http://localhost/api/vin/X", {
    headers: { "x-vercel-forwarded-for": ip },
  });

describe("guardVinRoute", () => {
  it("limits a signed-in user by id across rotating IPs", async () => {
    const getUserId = async () => "user-rotating";
    let blocked = 0;
    for (let i = 0; i < VIN_USER_LIMIT_PER_MIN + 5; i++) {
      const g = await guardVinRoute(req(`10.0.${i}.1`), { getUserId });
      if (g.blocked) {
        blocked++;
        expect(g.blocked.status).toBe(429);
      }
    }
    expect(blocked).toBe(5);
  });

  it("caps new cache rows per instance (shared across IPs)", async () => {
    const g1 = await guardVinRoute(req("10.9.0.1"), {
      getUserId: async () => null,
    });
    const g2 = await guardVinRoute(req("10.9.0.2"), {
      getUserId: async () => null,
    });
    let ok = 0;
    for (let i = 0; i < VIN_DECODE_WRITES_PER_HOUR + 10; i++)
      if ((i % 2 ? g1 : g2).canWrite()) ok++;
    expect(ok).toBe(VIN_DECODE_WRITES_PER_HOUR);
  });

  it("gives each request an overall deadline", async () => {
    const g = await guardVinRoute(req("10.8.0.1"), {
      getUserId: async () => null,
    });
    expect(g.deadline.expired()).toBe(false);
    expect(g.deadline.remainingMs()).toBeGreaterThan(0);
  });
});
