import { afterEach, describe, expect, it, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("./embeddings", () => ({ generateEmbedding: generate }));
import { backfillEmbeddings } from "./deal-embeddings";

afterEach(() => {
  vi.unstubAllEnvs();
  generate.mockReset();
});

function database(readError: { message: string } | null = null) {
  const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  const query: any = {
    select: () => query,
    is: () => query,
    eq: () => query,
    not: () => query,
    limit: async () => ({
      data: [{ id: "one", make: "Ford" }],
      error: readError,
    }),
    then: (resolve: (value: unknown) => unknown) =>
      resolve({ count: 9, error: null }),
    update,
  };
  return { client: { from: () => query } as any, update };
}

describe("Embedding backfill proof", () => {
  it("reports a database failure rather than successful zero work", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    await expect(
      backfillEmbeddings(database({ message: "unavailable" }).client),
    ).rejects.toThrow("inventory read failed");
  });

  it("rejects malformed vectors without writing them or claiming success", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    generate.mockResolvedValue([1, 2, 3]);
    const db = database();
    await expect(backfillEmbeddings(db.client)).rejects.toThrow(
      "made no progress",
    );
    expect(db.update).not.toHaveBeenCalled();
  });

  it("persists valid vectors and reports the remaining backlog", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test");
    generate.mockResolvedValue(Array(768).fill(0.5));
    const db = database();
    await expect(backfillEmbeddings(db.client)).resolves.toEqual({
      updated: 1,
      remaining: 9,
      skipped: false,
    });
    expect(db.update).toHaveBeenCalledTimes(1);
  });
});
