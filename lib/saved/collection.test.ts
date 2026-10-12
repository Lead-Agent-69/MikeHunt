import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchSavedPage,
  parseSavedCursor,
  savedCollectionKey,
  savedGroup,
} from "./collection";
const id = "e00f1198-4775-4223-9f28-f14f5835e42c";
afterEach(() => vi.unstubAllGlobals());
describe("saved collection receipts and cursors", () => {
  it("preserves timestamp precision and nullable historical dates", () => {
    for (const savedAt of [null, "2026-10-12T00:00:00.123456+00:00"]) {
      expect(parseSavedCursor(JSON.stringify({ id, savedAt }))).toEqual({
        id,
        savedAt,
      });
    }
  });
  it("rejects untrusted filter syntax and invalid IDs/dates", () => {
    for (const cursor of [
      { id: [id], savedAt: null },
      { id: "bad", savedAt: null },
      { id, savedAt: "2026-10-12T00:00:00Z),user_id.neq.one" },
      { id, savedAt: "never" },
    ])
      expect(() => parseSavedCursor(JSON.stringify(cursor))).toThrow();
  });
  it("encodes cursors and separates owners in cache keys", () => {
    const cursor = JSON.stringify({ id, savedAt: null });
    const [url, owner] = savedCollectionKey("one", "page", "all", cursor);
    expect(new URL(url, "http://localhost").searchParams.get("cursor")).toBe(
      cursor,
    );
    expect(owner).toBe("one");
  });
  it("rejects wrong-account receipts including empty collections", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ ownerId: "two", rows: [], nextCursor: null }),
          ),
        ),
    );
    await expect(fetchSavedPage(["/api/saved-cars", "one"])).rejects.toThrow(
      "Unconfirmed",
    );
  });
  it("requires bounded confirmed rows and an explicit continuation", async () => {
    for (const data of [
      { ownerId: "one", rows: [] },
      { ownerId: "one", rows: [null], nextCursor: null },
      {
        ownerId: "one",
        rows: Array.from({ length: 51 }, () => ({ id })),
        nextCursor: null,
      },
    ]) {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(JSON.stringify(data))),
      );
      await expect(
        fetchSavedPage(["/api/saved-cars", "one"]),
      ).rejects.toThrow();
    }
  });
  it("every database status gets a visible group", () => {
    expect(savedGroup("watching")).toBe("active");
    for (const status of ["passed", "archived", null])
      expect(savedGroup(status)).toBe("other");
    expect(savedGroup("acquired")).toBe("acquired");
    expect(savedGroup("unavailable")).toBe("gone");
  });
});
