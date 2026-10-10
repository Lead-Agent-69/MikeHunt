import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { spoolReceipt, reconcileReceipts } from "./receipt-spool";
let temp: string | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  if (temp) await rm(temp, { recursive: true });
  temp = undefined;
});
describe("receipt reconciliation", () => {
  it("preserves failed receipts and removes them only after an idempotent database acknowledgement", async () => {
    temp = await mkdtemp(path.join(tmpdir(), "mikehunt-receipts-test-"));
    vi.stubEnv("LOCAL_CACHE_PATH", temp);
    await spoolReceipt({
      source: "dealer",
      diagnostic: "token=secret https://dealer.example/car?token=secret",
    });
    const names = await readdir(path.join(temp, "receipts"));
    const body = await readFile(path.join(temp, "receipts", names[0]), "utf8");
    expect(body).not.toContain("secret");
    const upsert = vi
      .fn()
      .mockResolvedValueOnce({ error: { message: "offline" } })
      .mockResolvedValue({ error: null });
    const client = { from: vi.fn(() => ({ upsert })) } as any;
    expect(await reconcileReceipts(client)).toBe(0);
    expect(await readdir(path.join(temp, "receipts"))).toHaveLength(1);
    expect(await reconcileReceipts(client)).toBe(1);
    expect(await readdir(path.join(temp, "receipts"))).toHaveLength(0);
    expect(upsert.mock.calls[0][0].id).toBe(upsert.mock.calls[1][0].id);
  });
});
