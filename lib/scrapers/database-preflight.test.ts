import { describe, expect, it, vi } from "vitest";
import { verifyScraperDatabaseConnection } from "./database-preflight";

describe("scraper database preflight", () => {
  it("accepts a bounded successful inventory read", async () => {
    const probe = vi.fn(async (signal: AbortSignal) => {
      expect(signal).toBeInstanceOf(AbortSignal);
      return { error: null };
    });

    await expect(
      verifyScraperDatabaseConnection(probe),
    ).resolves.toBeUndefined();
    expect(probe).toHaveBeenCalledOnce();
  });

  it("fails closed without copying a provider error message into worker status", async () => {
    await expect(
      verifyScraperDatabaseConnection(async () => ({
        error: { code: "PGRST301", message: "sensitive upstream detail" },
      })),
    ).rejects.toThrow("Scraper database connection check failed (PGRST301)");
  });

  it("turns network failures into a stable operator-facing error", async () => {
    await expect(
      verifyScraperDatabaseConnection(async () => {
        throw new Error("request included secret-bearing headers");
      }),
    ).rejects.toThrow(
      "Scraper database connection check failed (network or timeout)",
    );
  });
});
