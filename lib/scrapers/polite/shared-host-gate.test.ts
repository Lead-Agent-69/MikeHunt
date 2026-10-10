import { afterEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  status: "ready",
  eval: vi.fn(),
  disconnect: vi.fn(),
}));
vi.mock("ioredis", () => ({
  default: class {
    constructor() {
      return fake;
    }
  },
}));
import {
  withSharedHost,
  closeSharedHostGate,
  ACQUIRE_HOST,
  RELEASE_HOST,
} from "./shared-host-gate";
afterEach(() => {
  closeSharedHostGate();
  vi.unstubAllEnvs();
  fake.eval.mockReset();
});
describe("shared host coordination", () => {
  it("does not send requests without coordination", async () => {
    vi.stubEnv("REDIS_URL", "");
    const task = vi.fn();
    await expect(withSharedHost("dealer.example", 0, task)).rejects.toThrow(
      "REDIS_URL",
    );
    expect(task).not.toHaveBeenCalled();
  });
  it("defers a competing worker without sending requests", async () => {
    vi.stubEnv("REDIS_URL", "redis://fixture");
    fake.eval.mockResolvedValue(90000);
    const task = vi.fn();
    await expect(withSharedHost("dealer.example", 0, task)).rejects.toThrow(
      "deferred",
    );
    expect(task).not.toHaveBeenCalled();
  });
  it("releases only its own lease even when the request fails", async () => {
    vi.stubEnv("REDIS_URL", "redis://fixture");
    fake.eval.mockResolvedValue(0);
    await expect(
      withSharedHost("dealer.example", 0, async () => {
        throw new Error("HTTP 503");
      }),
    ).rejects.toThrow("503");
    const claim = fake.eval.mock.calls[0];
    expect(claim[0]).toBe(ACQUIRE_HOST);
    expect(claim.at(-1)).toBe(5000);
    expect(fake.eval.mock.calls[1]).toEqual([
      RELEASE_HOST,
      1,
      claim[2],
      claim[5],
    ]);
  });
});
